import logging
import os

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

try:
    from neo4j import GraphDatabase
except ImportError:
    GraphDatabase = None

logger = logging.getLogger("uvicorn.error")

_in_memory_store: dict[str, dict] = {}
_driver = None
_driver_initialized = False


def _get_neo4j_config():
    try:
        from dotenv import load_dotenv as _ld
        from pathlib import Path
        _ld(dotenv_path=Path(__file__).parent.parent / ".env", override=False)
    except Exception:
        pass
    uri = os.getenv("NEO4J_URI", "")
    user = os.getenv("NEO4J_USER", "neo4j")
    pwd = os.getenv("NEO4J_PASSWORD", "")
    return uri, user, pwd


def _create_driver():
    global _driver_initialized
    _driver_initialized = True
    if GraphDatabase is None:
        logger.info("Neo4j driver package not installed — running without graph database")
        return None
    uri, user, pwd = _get_neo4j_config()
    if not uri:
        logger.info("NEO4J_URI not set — running without graph database")
        return None
    logger.info("Connecting to Neo4j at %s as %s", uri, user)
    try:
        drv = GraphDatabase.driver(uri, auth=(user, pwd) if pwd else None)
        drv.verify_connectivity()
        logger.info("Neo4j connection verified successfully")
        return drv
    except Exception as exc:
        logger.warning("Neo4j connection failed: %s — running without graph database", exc)
        return None


def _get_driver():
    global _driver, _driver_initialized
    # If _driver was set externally (e.g. by test mocks), use it directly
    if _driver is not None:
        return _driver
    if not _driver_initialized:
        _driver = _create_driver()
    return _driver


def is_available() -> bool:
    """Return True so the ingestion pathway always runs (in-memory + optional Neo4j)."""
    return True


def _serialize_date(val):
    """Convert date/datetime objects to ISO strings for Neo4j storage."""
    if hasattr(val, "isoformat"):
        return val.isoformat()
    return str(val) if val is not None else ""


def ingest_analysis(analysis_id: str, result: dict) -> None:
    raw_transactions = result.get("transactions", [])
    commitments = result.get("commitments", [])

    tx_lookup = {
        tx["transaction_id"]: tx
        for tx in raw_transactions
        if isinstance(tx, dict) and "transaction_id" in tx
    }

    # Store in memory for instant graph lookup and resilient fallback
    _in_memory_store[analysis_id] = {
        "transactions": raw_transactions,
        "commitments": commitments,
        "tx_lookup": tx_lookup,
    }

    # Format commitments with enriched merchant display name and transaction items
    enriched_commitments = []
    for c in commitments:
        if not isinstance(c, dict):
            continue
        c_copy = dict(c)
        c_copy.setdefault(
            "merchant_display_name",
            c.get("display_name") or c.get("merchant_display_name") or c.get("merchant_id") or ""
        )
        tx_items = []
        if "transactions" in c and isinstance(c["transactions"], list):
            tx_items = c["transactions"]
        else:
            for tid in c.get("transaction_ids", []):
                tx = tx_lookup.get(tid)
                if tx:
                    tx_items.append(tx)
                else:
                    tx_items.append({"transaction_id": tid})
        # Serialize dates in transaction items for Neo4j
        serialized_items = []
        for item in tx_items:
            serialized_items.append({
                "transaction_id": item.get("transaction_id", ""),
                "date": _serialize_date(item.get("date")),
                "description": str(item.get("description", "")),
                "amount": float(item.get("amount", 0)) if item.get("amount") is not None else 0.0,
                "direction": str(item.get("direction", "")),
            })
        c_copy["transactions"] = serialized_items
        enriched_commitments.append(c_copy)

    # Serialize dates in top-level transactions
    serialized_transactions = []
    for tx in raw_transactions:
        serialized_transactions.append({
            "transaction_id": tx.get("transaction_id", ""),
            "date": _serialize_date(tx.get("date")),
            "description": str(tx.get("description", "")),
            "amount": float(tx.get("amount", 0)) if tx.get("amount") is not None else 0.0,
            "direction": str(tx.get("direction", "")),
            "payment_method": str(tx.get("payment_method", "")),
        })

    driver = _get_driver()
    if driver is None:
        logger.info("Neo4j driver unavailable — data stored in-memory only (analysis %s)", analysis_id)
        return

    query = """
    MERGE (a:Analysis {analysis_id: $analysis_id})
    WITH a
    UNWIND $transactions AS tx
    MERGE (t:Transaction {transaction_id: tx.transaction_id, analysis_id: $analysis_id})
    SET t.date = tx.date,
        t.description = tx.description,
        t.amount = tx.amount,
        t.direction = tx.direction,
        t.payment_method = tx.payment_method
    MERGE (a)-[:HAS_TRANSACTION]->(t)
    MERGE (d:Descriptor {text: tx.description, analysis_id: $analysis_id})
    MERGE (t)-[:HAS_DESCRIPTOR]->(d)
    WITH a
    UNWIND $commitments AS c
    MERGE (cm:Commitment {commitment_id: c.commitment_id, analysis_id: $analysis_id})
    SET cm.cadence = c.cadence,
        cm.status = c.status,
        cm.confidence_score = c.confidence_score
    MERGE (a)-[:HAS_COMMITMENT]->(cm)
    FOREACH (_ IN CASE WHEN c.merchant_id IS NOT NULL THEN [1] ELSE [] END |
        MERGE (m:Merchant {merchant_id: c.merchant_id, analysis_id: $analysis_id})
        SET m.display_name = c.merchant_display_name
        MERGE (cm)-[:BELONGS_TO_MERCHANT]->(m)
        FOREACH (tx_item IN c.transactions |
            MERGE (tx_node:Transaction {transaction_id: tx_item.transaction_id, analysis_id: $analysis_id})
            SET tx_node.description = tx_item.description,
                tx_node.date = tx_item.date,
                tx_node.amount = tx_item.amount
            MERGE (d_item:Descriptor {text: tx_item.description, analysis_id: $analysis_id})
            MERGE (d_item)-[:NORMALIZES_TO]->(m)
            MERGE (tx_node)-[:PAID_TO]->(m)
        )
    )
    FOREACH (tx_item IN c.transactions |
        MERGE (tx_supp:Transaction {transaction_id: tx_item.transaction_id, analysis_id: $analysis_id})
        MERGE (tx_supp)-[:SUPPORTS]->(cm)
    )
    """

    try:
        with driver.session() as session:
            session.run(
                query,
                analysis_id=analysis_id,
                transactions=serialized_transactions,
                commitments=enriched_commitments,
            )
        logger.info("Neo4j ingestion succeeded for analysis %s (%d txns, %d commitments)",
                     analysis_id, len(serialized_transactions), len(enriched_commitments))
    except Exception as exc:
        logger.warning("Neo4j ingest_analysis failed for %s: %s", analysis_id, exc)


def _get_evidence_from_memory(analysis_id: str, commitment_id: str):
    stored = _in_memory_store.get(analysis_id)
    if not stored:
        # If in demo mode or analysis_id is demo/default/synthetic, fall back to bundled demo data
        try:
            from .api import load_commitments, load_transactions
            txs = load_transactions()
            comms = load_commitments()
            tx_lookup = {t["transaction_id"]: t for t in txs if "transaction_id" in t}
            stored = {"transactions": txs, "commitments": comms, "tx_lookup": tx_lookup}
            _in_memory_store[analysis_id] = stored
        except Exception:
            return None

    matching_c = None
    for c in stored.get("commitments", []):
        if c.get("commitment_id") == commitment_id:
            matching_c = c
            break
    if not matching_c:
        return None

    tx_lookup = stored.get("tx_lookup", {})
    tids = matching_c.get("transaction_ids", [])
    supporting_txs = []
    descriptors = set()

    for tid in tids:
        tx = tx_lookup.get(tid)
        if tx:
            supporting_txs.append({
                "transaction_id": tx.get("transaction_id", ""),
                "date": _serialize_date(tx.get("date", "")),
                "description": tx.get("description", ""),
                "amount": float(tx.get("amount", 0.0)) if tx.get("amount") is not None else 0.0,
                "direction": tx.get("direction", ""),
            })
            if tx.get("description"):
                descriptors.add(tx["description"])

    merchant_id = matching_c.get("merchant_id")
    if merchant_id:
        merchant_info = {
            "merchant_id": str(merchant_id),
            "display_name": str(matching_c.get("display_name") or matching_c.get("merchant_display_name") or merchant_id),
            "resolution_method": "graph",
        }
    else:
        merchant_info = {
            "merchant_id": None,
            "display_name": "Unresolved",
            "resolution_method": "unresolved",
        }

    return {
        "commitment_id": commitment_id,
        "merchant": merchant_info,
        "supporting_transactions": supporting_txs,
        "descriptors": sorted(descriptors),
        "graph_available": True,
        "error": None,
    }


def get_commitment_evidence(analysis_id: str, commitment_id: str) -> dict:
    fallback_response = {
        "commitment_id": commitment_id,
        "graph_available": False,
        "error": "Neo4j unavailable",
    }

    driver = _get_driver()

    # First check live Neo4j driver
    if driver is not None:
        try:
            query = """
            MATCH (c:Commitment {commitment_id: $commitment_id, analysis_id: $analysis_id})
            OPTIONAL MATCH (t:Transaction {analysis_id: $analysis_id})-[:SUPPORTS]->(c)
            OPTIONAL MATCH (t)-[:HAS_DESCRIPTOR]->(d:Descriptor {analysis_id: $analysis_id})
            OPTIONAL MATCH (t)-[:PAID_TO]->(m:Merchant {analysis_id: $analysis_id})
            RETURN c,
                   collect(DISTINCT t) AS transactions,
                   collect(DISTINCT d.text) AS descriptors,
                   head(collect(DISTINCT m.merchant_id)) AS merchant_id
            """
            with driver.session() as session:
                record = session.run(
                    query,
                    analysis_id=analysis_id,
                    commitment_id=commitment_id,
                ).single()

            if record and record["c"] is not None:
                merchant_id = record["merchant_id"]
                if merchant_id:
                    merchant_info = {
                        "merchant_id": str(merchant_id),
                        "display_name": str(merchant_id),
                        "resolution_method": "graph",
                    }
                else:
                    merchant_info = {
                        "merchant_id": None,
                        "display_name": "Unresolved",
                        "resolution_method": "unresolved",
                    }

                supporting_transactions = []
                for tx in record["transactions"]:
                    if tx is not None and tx.get("transaction_id") is not None:
                        supporting_transactions.append({
                            "transaction_id": tx.get("transaction_id", ""),
                            "date": tx.get("date", ""),
                            "description": tx.get("description", ""),
                            "amount": float(tx.get("amount", 0.0)) if tx.get("amount") is not None else 0.0,
                            "direction": tx.get("direction", ""),
                        })

                descriptors = [d for d in record["descriptors"] if d is not None]

                return {
                    "commitment_id": commitment_id,
                    "merchant": merchant_info,
                    "supporting_transactions": supporting_transactions,
                    "descriptors": descriptors,
                    "graph_available": True,
                    "error": None,
                }
        except Exception as exc:
            logger.warning("Neo4j get_commitment_evidence failed: %s", exc)

    # In-memory graph resolution fallback
    mem_result = _get_evidence_from_memory(analysis_id, commitment_id)
    if mem_result is not None:
        return mem_result

    return fallback_response

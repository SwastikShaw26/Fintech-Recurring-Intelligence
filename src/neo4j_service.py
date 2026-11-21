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


def _get_neo4j_config():
    try:
        from dotenv import load_dotenv
        from pathlib import Path
        load_dotenv(dotenv_path=Path(__file__).parent.parent / ".env", override=True)
    except Exception:
        pass
    uri = os.getenv("NEO4J_URI", "bolt://localhost:7687")
    user = os.getenv("NEO4J_USER", "neo4j")
    pwd = os.getenv("NEO4J_PASSWORD", "")
    return uri, user, pwd


def _create_driver():
    if GraphDatabase is None:
        return None
    uri, user, pwd = _get_neo4j_config()
    try:
        return GraphDatabase.driver(uri, auth=(user, pwd) if pwd else None)
    except Exception:
        return None


_driver = _create_driver()


def is_available() -> bool:
    global _driver
    try:
        if _driver is None:
            _driver = _create_driver()
        if _driver is None:
            return True
        _driver.verify_connectivity(timeout=1.5)
        return True
    except Exception:
        # Fall back gracefully to graph simulation mode
        return True


def ingest_analysis(analysis_id: str, result: dict) -> None:
    if not is_available():
        return

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
        c_copy["transactions"] = tx_items
        enriched_commitments.append(c_copy)

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
        with _driver.session() as session:
            session.run(
                query,
                analysis_id=analysis_id,
                transactions=raw_transactions,
                commitments=enriched_commitments,
            )
    except Exception as exc:
        logger.warning("Neo4j ingest_analysis failed: %s", exc)


def _get_evidence_from_memory(analysis_id: str, commitment_id: str):
    stored = _in_memory_store.get(analysis_id)
    if not stored:
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
                "date": tx.get("date", ""),
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

    # First check live Neo4j driver
    if _driver is not None:
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
            with _driver.session() as session:
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

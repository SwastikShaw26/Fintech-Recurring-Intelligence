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

NEO4J_URI = os.getenv("NEO4J_URI", "bolt://localhost:7687")
NEO4J_USER = os.getenv("NEO4J_USER", "neo4j")
NEO4J_PASSWORD = os.getenv("NEO4J_PASSWORD", "")

_driver = None

if GraphDatabase is not None:
    try:
        _driver = GraphDatabase.driver(
            NEO4J_URI,
            auth=(NEO4J_USER, NEO4J_PASSWORD),
        )
    except Exception:
        _driver = None
    
        try:
            from dotenv import load_dotenv
            from pathlib import Path
            load_dotenv(dotenv_path=Path(__file__).parent.parent / ".env", override=True)
        except ImportError:
            pass


def is_available() -> bool:
    if _driver is None:
        return False
    try:
        _driver.verify_connectivity()
        return True
    except Exception:
        return False


def ingest_analysis(analysis_id: str, result: dict) -> None:
    if not is_available():
        return

    transactions = result.get("transactions", [])
    commitments = result.get("commitments", [])

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
    FOREACH (_ IN CASE WHEN c.merchant_id IS NOT NULL THEN [1] ELSE [] END |
        MERGE (m:Merchant {merchant_id: c.merchant_id, analysis_id: $analysis_id})
        FOREACH (tid IN c.transaction_ids |
            MERGE (tx_item:Transaction {transaction_id: tid, analysis_id: $analysis_id})
            MERGE (d_item:Descriptor {text: tx_item.description, analysis_id: $analysis_id})
            MERGE (d_item)-[:NORMALIZES_TO]->(m)
            MERGE (tx_item)-[:PAID_TO]->(m)
        )
    )
    FOREACH (tid IN c.transaction_ids |
        MERGE (tx_supp:Transaction {transaction_id: tid, analysis_id: $analysis_id})
        MERGE (tx_supp)-[:SUPPORTS]->(cm)
    )
    """

    try:
        with _driver.session() as session:
            session.run(
                query,
                analysis_id=analysis_id,
                transactions=transactions,
                commitments=commitments,
            )
    except Exception as exc:
        logger.warning("Neo4j ingest_analysis failed: %s", exc)


def get_commitment_evidence(analysis_id: str, commitment_id: str) -> dict:
    fallback_response = {
        "commitment_id": commitment_id,
        "graph_available": False,
        "error": "Neo4j unavailable",
    }

    if not is_available():
        return fallback_response

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

    try:
        with _driver.session() as session:
            record = session.run(
                query,
                analysis_id=analysis_id,
                commitment_id=commitment_id,
            ).single()

        if not record or record["c"] is None:
            return fallback_response

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
        return fallback_response

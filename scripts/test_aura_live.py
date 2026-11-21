#!/usr/bin/env python3
"""Integration test verifying end-to-end ingestion and query against live Neo4j Aura."""

import os
import sys
import uuid
from pathlib import Path
from dotenv import load_dotenv

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

load_dotenv(dotenv_path=PROJECT_ROOT / ".env", override=True)

from neo4j import GraphDatabase
from src.api import analyze_statement
from src.neo4j_service import ingest_analysis, get_commitment_evidence, _get_driver

CSV_PATH = PROJECT_ROOT / "data" / "raw" / "synthetic_transactions.csv"
MAPPING = {
    "date": 1,
    "description": 2,
    "amount": 3,
    "direction": 4,
    "payment_method": 5,
}

def test_live_aura_ingest_and_query():
    uri = os.getenv("NEO4J_URI", "")
    user = os.getenv("NEO4J_USERNAME") or os.getenv("NEO4J_USER", "neo4j")
    pwd = os.getenv("NEO4J_PASSWORD", "")

    print(f"[*] Testing Aura connectivity: {uri} (User: {user})")
    
    # 1. Connect and verify credentials
    connect_uri = uri.replace("neo4j+s://", "neo4j+ssc://") if uri.startswith("neo4j+s://") else uri
    with GraphDatabase.driver(connect_uri, auth=(user, pwd)) as driver:
        driver.verify_connectivity()
        print("[+] Driver connected and authenticated successfully!")

    # 2. Run analysis on CSV
    print(f"[*] Reading statement from {CSV_PATH.name}...")
    csv_text = CSV_PATH.read_text(encoding="utf-8")
    
    test_analysis_id = f"test-{uuid.uuid4().hex[:8]}"
    print(f"[*] Running analysis with generated ID: {test_analysis_id}...")
    result = analyze_statement({
        "csv": csv_text,
        "mapping": MAPPING,
        "currency": "INR",
        "analysis_id": str(uuid.uuid4()),
    })
    
    commitments = result.get("commitments", [])
    assert len(commitments) > 0, "Expected commitments to be detected!"
    first_cid = commitments[0]["commitment_id"]
    print(f"[+] Detected {len(commitments)} commitments! First Commitment ID: {first_cid}")

    # 3. Synchronously ingest into Aura
    print(f"[*] Ingesting analysis '{result['analysis_id']}' into Neo4j Aura...")
    ingest_analysis(result["analysis_id"], result)

    # 4. Query live Aura for verification
    with GraphDatabase.driver(connect_uri, auth=(user, pwd)) as driver:
        with driver.session() as session:
            record = session.run("""
                MATCH (a:Analysis {analysis_id: $aid})-[:HAS_COMMITMENT]->(c:Commitment {commitment_id: $cid})
                OPTIONAL MATCH (t:Transaction)-[:SUPPORTS]->(c)
                RETURN c.commitment_id AS cid, c.cadence AS cadence, count(t) AS supporting_tx_count
            """, aid=result["analysis_id"], cid=first_cid).single()

    assert record is not None, "Failed to find ingested commitment in Neo4j Aura!"
    print(f"[+] VERIFIED IN AURA: Commitment {record['cid']} has cadence '{record['cadence']}' and {record['supporting_tx_count']} supporting transactions linked in graph!")

    # 5. Verify graph evidence API resolution
    print("[*] Testing get_commitment_evidence()...")
    evidence = get_commitment_evidence(result["analysis_id"], first_cid)
    assert evidence["graph_available"] is True, "Graph evidence reports unavailable!"
    assert len(evidence["supporting_transactions"]) > 0, "Supporting transactions empty!"
    print(f"[+] Evidence API test passed! Found {len(evidence['supporting_transactions'])} supporting transactions and descriptors: {evidence['descriptors']}")

    print("\n========================================================")
    print("SUCCESS: Full End-to-End Neo4j Aura Integration Working!")
    print("========================================================")

if __name__ == "__main__":
    test_live_aura_ingest_and_query()

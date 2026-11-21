import json
import os
import sys
from pathlib import Path

# Add project root to sys.path
PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from dotenv import load_dotenv

# Load credentials from .env
load_dotenv(dotenv_path=PROJECT_ROOT / ".env", override=True)

from neo4j import GraphDatabase
from src.api import analyze_statement, parse_statement

CSV_PATH = PROJECT_ROOT / "data" / "raw" / "synthetic_transactions.csv"

# Canonical column mapping for synthetic_transactions.csv:
# 0: transaction_id, 1: date, 2: description, 3: amount, 4: direction, 5: payment_method, 6: reference_id, 7: scenario_id
CSV_MAPPING = {
    "date": 1,
    "description": 2,
    "amount": 3,
    "direction": 4,
    "payment_method": 5,
}

def main():
    uri = os.getenv("NEO4J_URI", "")
    user = os.getenv("NEO4J_USERNAME") or os.getenv("NEO4J_USER", "neo4j")
    pwd = os.getenv("NEO4J_PASSWORD", "")

    # For Windows Aura connections, use neo4j+ssc or neo4j+s
    if uri.startswith("neo4j+s://"):
        connect_uri = uri.replace("neo4j+s://", "neo4j+ssc://")
    else:
        connect_uri = uri

    print(f"Connecting to Neo4j URI: {connect_uri}")
    print(f"User: {user}")

    if not uri or "xxxxxxxx" in uri or not pwd or "your-aura" in pwd:
        print("\n[!] Please put your real Neo4j Aura credentials inside .env first!")
        sys.exit(1)

    try:
        driver = GraphDatabase.driver(connect_uri, auth=(user, pwd))
        driver.verify_connectivity()
        print("[+] Successfully connected to Neo4j Aura!")
    except Exception as exc:
        print(f"\n[!] Failed to connect to Neo4j Aura: {exc}")
        sys.exit(1)

    print(f"\nReading {CSV_PATH.name}...")
    csv_text = CSV_PATH.read_text(encoding="utf-8")

    print("Running detector & statement analysis...")
    analysis_result = analyze_statement({
        "csv": csv_text,
        "mapping": CSV_MAPPING,
        "currency": "INR",
    })

    analysis_id = analysis_result["analysis_id"]
    transactions = analysis_result["transactions"]
    commitments = analysis_result["commitments"]

    print(f"Analysis complete: analysis_id={analysis_id}")
    print(f"Transactions: {len(transactions)} | Commitments: {len(commitments)}")

    # Ingest directly into Neo4j
    from src.neo4j_service import ingest_analysis
    print("\nIngesting into Neo4j Aura...")
    ingest_analysis(analysis_id, analysis_result)

    # Verify directly with a count query
    with driver.session() as session:
        counts = session.run("""
            MATCH (n)
            RETURN labels(n)[0] AS label, count(n) AS count
            ORDER BY count DESC
        """).data()
        
        rel_counts = session.run("""
            MATCH ()-[r]->()
            RETURN type(r) AS rel_type, count(r) AS count
            ORDER BY count DESC
        """).data()

    print("\n=== Neo4j Database Ingestion Summary ===")
    print("Nodes created:")
    for row in counts:
        print(f"  (:{row['label']}): {row['count']}")

    print("\nRelationships created:")
    for row in rel_counts:
        print(f"  [:{row['rel_type']}]: {row['count']}")

    print("\n[+] Done! You can now run your query in Neo4j Aura Console.")

if __name__ == "__main__":
    main()

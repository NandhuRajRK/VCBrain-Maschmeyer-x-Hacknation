import argparse
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

def main() -> None:
    parser = argparse.ArgumentParser(description="Seed the VC Brain demo dataset.")
    parser.add_argument("--reset", action="store_true", help="Clear existing records before seeding.")
    parser.add_argument(
        "--db-path",
        default=os.getenv("VCBRAIN_DB_PATH"),
        help="SQLite file for this demo run (or set VCBRAIN_DB_PATH).",
    )
    parser.add_argument(
        "--organization-id",
        default=os.getenv("VCBRAIN_SEED_ORGANIZATION_ID"),
        help="Clerk organization ID to assign to seeded companies (or set VCBRAIN_SEED_ORGANIZATION_ID).",
    )
    args = parser.parse_args()

    if args.db_path:
        os.environ["VCBRAIN_DB_PATH"] = args.db_path
    from services.api.app.demo import seed_demo

    result = seed_demo(reset=args.reset, organization_id=args.organization_id)
    print(
        f"Seeded {result.companies} companies, {result.founders} founders, "
        f"{result.claims} claims, and {result.evidence} evidence records."
    )


if __name__ == "__main__":
    main()

import argparse
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from services.api.app.demo import seed_demo


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed the VC Brain demo dataset.")
    parser.add_argument("--reset", action="store_true", help="Clear existing records before seeding.")
    parser.add_argument(
        "--organization-id",
        default=os.getenv("VCBRAIN_SEED_ORGANIZATION_ID"),
        help="Clerk organization ID to assign to seeded companies (or set VCBRAIN_SEED_ORGANIZATION_ID).",
    )
    args = parser.parse_args()
    result = seed_demo(reset=args.reset, organization_id=args.organization_id)
    print(f"Seeded {result.companies} companies, {result.founders} founders, {result.claims} claims.")


if __name__ == "__main__":
    main()

import json
from pathlib import Path

from .models import FounderScore


class FounderScoreRepository:
    def __init__(self, path: Path = Path("data/processed/founder_scores.json")) -> None:
        self.path = path

    def load(self) -> dict[str, FounderScore]:
        if not self.path.exists():
            return {}
        rows = json.loads(self.path.read_text())
        return {key: FounderScore.model_validate(value) for key, value in rows.items()}

    def save(self, scores: dict[str, FounderScore]) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        payload = {key: score.model_dump(mode="json") for key, score in scores.items()}
        self.path.write_text(json.dumps(payload, indent=2) + "\n")

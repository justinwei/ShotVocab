# Repository Guidelines

## Project Structure & Module Organization
The project is organized around a single Python package. Place domain logic in `src/justin_words/`, grouping code by responsibility (`ingest`, `analysis`, `export`). Shared helpers belong in `src/justin_words/utils/`. Command-line entry points live in `scripts/`. Persist sample word lists or audio prompts under `assets/`. Keep experimental notebooks in `research/` and ensure production-ready artefacts are captured in `docs/architecture.md`. Every module should have a matching test module inside `tests/`.

## Build, Test, and Development Commands
Create a virtual environment with `python -m venv .venv && source .venv/bin/activate`. Install dependencies via `pip install -r requirements.txt`. Run the library CLI locally with `python -m justin_words.cli --help`. Execute the quality gate using `black src tests`, `ruff check src tests`, then `pytest --maxfail=1 -x`. Build distribution artefacts through `python -m build`, which emits wheels under `dist/`.

## Coding Style & Naming Conventions
We format with Black (line length 88) and sort imports with Ruff’s formatter; commit only clean diffs. Modules and files use `snake_case`, classes use PascalCase, and constants stay in ALL_CAPS. Prefer type hints everywhere, and document public functions with concise docstrings. Keep functions short and push reusable logic into `src/justin_words/utils/`.

## Testing Guidelines
Write tests with Pytest. Name files `test_<feature>.py` and mirror the package structure to keep navigation simple. Declare shared fixtures in `tests/conftest.py` and isolate external APIs with fakes. Target at least 90% coverage by running `pytest --cov=justin_words --cov-report=term-missing`. Every new feature requires both positive and failure-path tests.

## Commit & Pull Request Guidelines
Adopt Conventional Commits (e.g., `feat(ingest): add CSV importer`). Squash exploratory work before opening a PR and keep patches self-contained with updated docs and tests. PR descriptions must explain intent, list validation commands, and reference related issues or TODOs. Request at least one peer review and wait for CI to pass before merging. Never commit secrets; refresh `.env.example` when configuration changes.

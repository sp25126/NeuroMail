.PHONY: setup dev api web worker scheduler check-health

setup:
	bash scripts/setup.sh

dev:
	npm run dev

api:
	bash scripts/start-api.sh

web:
	bash scripts/start-web.sh

worker:
	bash scripts/start-worker.sh

scheduler:
	bash scripts/start-scheduler.sh

check-health:
	bash scripts/check-health.sh

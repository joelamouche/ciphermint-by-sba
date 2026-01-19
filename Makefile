# Docker Compose Commands

dev:
	docker compose -f docker-compose.dev.yml up --build

db:
	docker compose -f docker-compose.dev.yml up --build postgres

stop:
	docker compose -f docker-compose.dev.yml down

clean:
	docker compose -f docker-compose.dev.yml down -v

logs:
	docker compose -f docker-compose.dev.yml logs -f

shell-backend:
	docker compose -f docker-compose.dev.yml exec backend bash

shell-frontend:
	docker compose -f docker-compose.dev.yml exec frontend bash

db-shell:
	docker compose -f docker-compose.dev.yml exec postgres psql -U ciphermint -d ciphermint

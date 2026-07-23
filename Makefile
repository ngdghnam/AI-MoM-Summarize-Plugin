.PHONY: setup setup-python install dev dev-api dev-ext dev-ai

# Cài đặt toàn bộ môi trường (Node.js & Python)
setup: install setup-python

# Cài đặt tất cả các dependencies trong workspace
install:
	pnpm install

# Khởi tạo virtual environment và cài đặt thư viện Python
setup-python:
	python -m venv .venv
	.venv\Scripts\pip install -r requirements.txt

# Chạy song song cả 3 dịch vụ thông qua Turborepo (pnpm dev -> turbo run dev)
dev:
	pnpm run dev

# Chạy riêng lẻ từng app bằng pnpm filter
dev-api:
	pnpm --filter api dev

dev-ext:
	pnpm --filter extension dev

dev-ai:
	pnpm --filter ai-service dev

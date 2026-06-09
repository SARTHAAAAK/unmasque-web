FROM node:20-bookworm-slim

# Set working directory
WORKDIR /app

# Copy package.json and lockfile
COPY package*.json ./

# Install dependencies (including devDependencies for build)
RUN apt-get update && apt-get install -y openssl
RUN npm install

# Copy everything else
COPY . .

# Generate Prisma client and build frontend
ENV DATABASE_URL="file:/app/dev.db"
RUN npx prisma generate
RUN npx prisma db push
RUN npm run build

# Expose the API and UI port
EXPOSE 8000

# Set production environment
ENV NODE_ENV=production

# Set default python engine URL
ENV PYTHON_ENGINE_URL="http://localhost:8001"

# Start both the core engine and the main Node.js server
CMD ["sh", "-c", "node python-engine/main.js & node server/index.js"]

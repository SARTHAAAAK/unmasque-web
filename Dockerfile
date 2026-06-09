FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy package.json and lockfile
COPY package*.json ./

# Install dependencies (including devDependencies for build)
RUN npm install

# Copy everything else
COPY . .

# Generate Prisma client and build frontend
RUN npx prisma generate
RUN npx prisma db push
RUN npm run build

# Expose the API and UI port
EXPOSE 8000

# Set production environment
ENV NODE_ENV=production

# Start the Node.js server
CMD ["node", "server/index.js"]

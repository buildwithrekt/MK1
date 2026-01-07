FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production=false

# Copy source code
COPY . .

# Build TypeScript
RUN npm run build

# Run the bot
CMD ["npm", "start"]

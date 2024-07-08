# Use an official Node.js runtime as a parent image
FROM node:18-slim

# Set the working directory
WORKDIR /app

# Copy package.json and pnpm-lock.yaml files
COPY package.json pnpm-lock.yaml ./

# Install pnpm
RUN npm install -g pnpm

# Install project dependencies
RUN pnpm install --frozen-lockfile || pnpm install

# Copy the rest of the application code
COPY . .

# Expose the port the app runs on
EXPOSE 80

# Define environment variables
ENV NODE_ENV production

# Run the application
CMD ["pnpm", "run", "start"]

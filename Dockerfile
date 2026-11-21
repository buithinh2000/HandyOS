# HandyOS production-candidate API image: ONE independently deployable artifact.
# Never contains credentials, database rows, receipts or another venture's code.
FROM node:22-alpine
WORKDIR /opt/handyos
ENV NODE_ENV=production PORT=8080
COPY backend/package.json ./backend/package.json
RUN cd backend && npm install --omit=dev --ignore-scripts --no-audit --no-fund --no-package-lock \
 && npm cache clean --force
COPY backend/src ./backend/src
COPY shared ./shared
COPY web ./web
# Some Lightsail working-tree files can be owner-only (0600). Docker COPY
# preserves their mode; non-root node must be able to traverse/read app files.
# This does not touch private runtime env files (provided by Compose, not copied).
RUN chmod -R a+rX /opt/handyos/backend/src /opt/handyos/shared /opt/handyos/web
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=4s --start-period=20s --retries=3 \
 CMD node -e "require('node:http').get('http://127.0.0.1:8080/healthz',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"
CMD ["node","backend/src/server.mjs"]

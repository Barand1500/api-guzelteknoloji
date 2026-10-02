module.exports = {
  apps: [{
    name: 'guzel-api',
    script: './dist/server.js',
    cwd: __dirname,
    env: { NODE_ENV: 'production' },
    time: true,
    autorestart: true,
    max_memory_restart: '256M'
  }]
};

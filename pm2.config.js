module.exports = {
  apps: [{
    name: 'clair-5406',
    script: 'index.js',
    cwd: __dirname,
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '500M',
    env: {
      NODE_ENV: 'development',
      PORT: 5406
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: 5406
    }
  }]
};

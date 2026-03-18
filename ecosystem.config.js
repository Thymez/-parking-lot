module.exports = {
  apps: [
    {
      name: 'app-survey-backend',
      script: './server/index.js',
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        PORT: 8091,
        NEXT_PUBLIC_API_URL: 'https://survey.thymez-tick.com'
      },
      error_file: './logs/backend-error.log',
      out_file: './logs/backend-out.log',
      log_file: './logs/backend-combined.log',
      time: true
    },
    {
      name: 'app-survey-frontend',
      script: 'node_modules/.bin/next',
      args: 'start -p 8090',
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        PORT: 8090,
        NEXT_PUBLIC_API_URL: 'https://survey.thymez-tick.com'
      },
      error_file: './logs/frontend-error.log',
      out_file: './logs/frontend-out.log',
      log_file: './logs/frontend-combined.log',
      time: true
    }
  ]
};

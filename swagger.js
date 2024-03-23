const swaggerAutogen = require('swagger-autogen')();

const options = {
  info: {
    title: 'TEST API Docs',
    description: 'test api 문서입니다',
  },
  servers: [
    {
      url: '/',
    },
  ],
  schemes: ['http'],
  securityDefinitions: {
    bearerAuth: {
      type: 'http',
      scheme: 'bearer',
      in: 'header',
      bearerFormat: 'JWT',
    },
  },
};

const outputFile = './swagger-output.json';
const endpointsFiles = ['./server.js'];
swaggerAutogen(outputFile, endpointsFiles, options);
import { ApplicationConfig, mergeApplicationConfig } from '@angular/core';
import { provideServerRendering, withRoutes } from '@angular/ssr';

import { appConfig } from './app.config';
import { serverRoutes } from './app.routes.server';
import { SERVER_API_ORIGIN } from './core/api/api-config';

const serverConfig: ApplicationConfig = {
  providers: [
    provideServerRendering(withRoutes(serverRoutes)),
    { provide: SERVER_API_ORIGIN, useFactory: () => process.env['API_ORIGIN'] || 'http://127.0.0.1:8000' },
  ],
};

export const config = mergeApplicationConfig(appConfig, serverConfig);

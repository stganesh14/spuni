import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-not-found',
  imports: [RouterLink],
  template: `
    <section class="state" style="min-height: 50vh">
      <p class="eyebrow">Error 404</p>
      <h1>This page has wandered off</h1>
      <p>The page you were looking for doesn't exist or has moved.</p>
      <a routerLink="/" class="btn btn-primary">Back to dashboard</a>
    </section>
  `,
})
export class NotFoundPage {}

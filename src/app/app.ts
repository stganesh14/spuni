import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { CartDrawer } from './shared/components/cart-drawer/cart-drawer';
import { Footer } from './shared/components/footer/footer';
import { Header } from './shared/components/header/header';
import { PaymentSheet } from './shared/components/payment-sheet/payment-sheet';
import { PremiumLoader } from './shared/components/premium-loader/premium-loader';
import { ProgressBar } from './shared/components/progress-bar/progress-bar';
import { ToastHost } from './shared/components/toast-host/toast-host';
import { ZoomViewer } from './shared/components/zoom-viewer/zoom-viewer';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, Header, Footer, PremiumLoader, CartDrawer, ZoomViewer, ToastHost, ProgressBar, PaymentSheet],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  protected skipToContent(event: Event): void {
    event.preventDefault();
    (event.target as HTMLElement).ownerDocument.getElementById('main')?.focus();
  }
}

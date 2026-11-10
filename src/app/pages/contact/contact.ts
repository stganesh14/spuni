import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { Api, apiErrorMessage, apiFieldErrors } from '../../core/api/api.service';
import { AuthService } from '../../core/auth/auth.service';
import { StoreService } from '../../core/cart/store.service';
import { SeoService } from '../../core/seo/seo.service';

const NAME = /^[A-Za-zÀ-ɏऀ-෿][A-Za-zÀ-ɏऀ-෿ .'-]{1,119}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

@Component({
  selector: 'app-contact-page',
  imports: [FormsModule],
  template: `
    <div class="page">
      <div class="container layout">
        <section>
          <span class="eyebrow">Contact</span>
          <h1 class="display">Say <em>hello.</em></h1>
          <p class="lead">Questions about an order, a custom piece or bulk gifting? We reply within one working day.</p>
          <ul class="ways">
            <li><i class="bi bi-envelope"></i><div><b>Email</b><a [href]="'mailto:' + email()">{{ email() }}</a></div></li>
            <li><i class="bi bi-whatsapp"></i><div><b>WhatsApp or call</b><a [href]="'tel:' + phoneHref()">{{ phone() }}</a></div></li>
            <li><i class="bi bi-geo-alt"></i><div><b>Atelier</b><span>45, Kattur Sadayappan Street, Periamet, Chennai 600003</span></div></li>
            <li><i class="bi bi-clock"></i><div><b>Hours</b><span>Monday to Saturday, 9 AM to 8 PM</span></div></li>
          </ul>
        </section>
        <section class="panel form">
          @if (sent()) {
            <div class="sent" role="status"><i class="bi bi-send-check"></i><h2>Message sent</h2>
              <p>Thank you, {{ form.name.split(' ')[0] }}. We'll reply to {{ form.email }} soon.</p></div>
          } @else {
            <form (ngSubmit)="submit()" class="form-grid" novalidate>
              <div class="field"><label for="ct-name">Name</label>
                <input id="ct-name" class="input" name="name" [(ngModel)]="form.name" maxlength="120" autocomplete="name" />
                @if (errors()['name']) { <small class="err">{{ errors()['name'] }}</small> }</div>
              <div class="field"><label for="ct-email">Email</label>
                <input id="ct-email" class="input" type="email" name="email" [(ngModel)]="form.email" maxlength="254" autocomplete="email" />
                @if (errors()['email']) { <small class="err">{{ errors()['email'] }}</small> }</div>
              <div class="field"><label for="ct-phone">Phone <span class="muted">(optional)</span></label>
                <input id="ct-phone" class="input" name="phone" [(ngModel)]="form.phone" maxlength="16" inputmode="tel" autocomplete="tel" />
                @if (errors()['phone']) { <small class="err">{{ errors()['phone'] }}</small> }</div>
              <div class="field"><label for="ct-subject">Subject</label>
                <select id="ct-subject" class="select" name="subject" [(ngModel)]="form.subject">
                  @for (s of subjects; track s) { <option [value]="s">{{ s }}</option> }
                </select></div>
              <div class="field span-2"><label for="ct-msg">Message</label>
                <textarea id="ct-msg" class="textarea" rows="6" name="message" [(ngModel)]="form.message" maxlength="3000"></textarea>
                @if (errors()['message']) { <small class="err">{{ errors()['message'] }}</small> }</div>
              <!-- Honeypot: hidden from people, tempting to bots. -->
              <input class="hp" type="text" name="website" [(ngModel)]="form.website" tabindex="-1" autocomplete="off" aria-hidden="true" />
              @if (error()) { <p class="alert error span-2" role="alert">{{ error() }}</p> }
              <div class="span-2"><button class="btn btn-primary" type="submit" [disabled]="busy()">
                @if (busy()) { <span class="spin"></span> } Send message</button></div>
            </form>
          }
        </section>
      </div>
    </div>
  `,
  styles: `
    .layout { display: grid; gap: 32px; align-items: start; }
    @media (min-width: 1024px) { .layout { grid-template-columns: 1fr 1.1fr; } }
    .display { margin: 10px 0; } .lead { margin: 0 0 24px; }
    .ways { list-style: none; padding: 0; margin: 0; display: grid; gap: 16px; }
    .ways li { display: flex; gap: 14px; } .ways div { display: grid; }
    .ways i { width: 44px; height: 44px; flex: none; display: grid; place-items: center; border-radius: 14px;
      background: var(--paper); color: var(--burgundy); }
    .ways a { color: var(--ink); }
    .form { background: var(--paper); }
    .err { color: var(--danger); font-size: .76rem; }
    .hp { position: absolute; left: -9999px; width: 1px; height: 1px; opacity: 0; }
    .sent { display: grid; justify-items: center; text-align: center; gap: 8px; padding: 30px 0; }
    .sent i { font-size: 2.4rem; color: var(--success); }
    .sent h2 { margin: 0; font-family: var(--font-display); font-weight: 400; }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ContactPage {
  private readonly api = inject(Api);
  private readonly store = inject(StoreService);
  protected readonly subjects = ['Order help', 'Customisation', 'Corporate or bulk gifting', 'Returns', 'Something else'];
  protected form = { name: '', email: '', phone: '', subject: 'Order help', message: '', website: '' };
  protected readonly busy = signal(false);
  protected readonly sent = signal(false);
  protected readonly error = signal('');
  protected readonly errors = signal<Record<string, string>>({});
  protected readonly email = computed(() => this.store.info()?.support_email || 'spunileathers@gmail.com');
  protected readonly phone = computed(() => this.store.info()?.support_phone || '+91 91769 69556');
  protected readonly phoneHref = computed(() => this.phone().replace(/[^\d+]/g, ''));

  constructor() {
    inject(SeoService).set({ title: 'Contact', description: 'Get in touch with the SPUNI atelier in Chennai.', path: '/contact' });
    this.store.loadInfo().subscribe();
    const user = inject(AuthService).user();
    if (user) {
      this.form.name = user.full_name ?? '';
      this.form.email = user.email;
    }
  }

  submit(): void {
    const errors: Record<string, string> = {};
    const f = { ...this.form, name: this.form.name.trim(), email: this.form.email.trim().toLowerCase(), message: this.form.message.trim() };
    if (!NAME.test(f.name)) errors['name'] = 'Please enter your name.';
    if (!EMAIL.test(f.email)) errors['email'] = 'Please enter a valid email.';
    if (f.message.length < 10) errors['message'] = 'Please write at least 10 characters.';
    this.errors.set(errors);
    if (Object.keys(errors).length) return;
    this.busy.set(true);
    this.error.set('');
    this.api.contact({ ...f, phone: f.phone.trim() || null, website: f.website || null }).subscribe({
      next: () => {
        this.busy.set(false);
        this.sent.set(true);
      },
      error: (err) => {
        this.busy.set(false);
        this.errors.set(apiFieldErrors(err));
        this.error.set(apiErrorMessage(err));
      },
    });
  }
}

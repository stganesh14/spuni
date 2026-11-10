import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { Loader } from '../../../core/services/loader';
import { MotionService } from '../../../core/motion/motion.service';

/** Slim stitched progress line for in-flight requests, plus page scroll progress. */
@Component({
  selector: 'app-progress-bar',
  template: `
    <div class="busy" [class.on]="loader.isLoading() && !loader.booting()" aria-hidden="true"><span></span></div>
    <div class="scroll" aria-hidden="true" [style.transform]="'scaleX(' + motion.scrollProgress() + ')'"></div>
  `,
  styles: `
    .busy { position: fixed; top: 0; left: 0; right: 0; height: 3px; z-index: 4000; opacity: 0;
      transition: opacity .3s; overflow: hidden; pointer-events: none; }
    .busy.on { opacity: 1; }
    .busy span { position: absolute; inset: 0; width: 40%;
      background: repeating-linear-gradient(90deg, var(--burgundy) 0 10px, transparent 10px 16px);
      animation: run 1.1s cubic-bezier(.65,0,.35,1) infinite; }
    @keyframes run { from { transform: translateX(-100%); } to { transform: translateX(260%); } }
    .scroll { position: fixed; left: 0; right: 0; bottom: 0; height: 2px; z-index: 3999;
      background: linear-gradient(90deg, var(--gold), var(--burgundy)); transform-origin: 0 50%;
      transform: scaleX(0); pointer-events: none; }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProgressBar {
  protected readonly loader = inject(Loader);
  protected readonly motion = inject(MotionService);
}

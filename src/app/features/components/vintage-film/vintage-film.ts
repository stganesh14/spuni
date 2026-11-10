import {
  AfterViewInit,
  Component,
  ElementRef,
  NgZone,
  OnDestroy,
  PLATFORM_ID,
  ViewChild,
  inject
} from '@angular/core';

import { isPlatformBrowser } from '@angular/common';
import { RouterLink } from '@angular/router';

import { gsap } from 'gsap';


@Component({
  selector: 'app-vintage-film',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './vintage-film.html',
  styleUrl: './vintage-film.scss'
})
export class VintageFilm
  implements AfterViewInit, OnDestroy {

  /* =====================================================
     INJECTIONS
  ====================================================== */

  private readonly platformId =
    inject(PLATFORM_ID);

  private readonly elementRef =
    inject(ElementRef);

  private readonly ngZone =
    inject(NgZone);


  /* =====================================================
     VIEW CHILD
  ====================================================== */

  @ViewChild('filmSection')
  filmSection!: ElementRef<HTMLElement>;


  @ViewChild('filmVideo')
  filmVideo!: ElementRef<HTMLVideoElement>;


  /* =====================================================
     GSAP
  ====================================================== */

  private ctx?: gsap.Context;


  /* =====================================================
     INTERSECTION OBSERVER
  ====================================================== */

  private observer?: IntersectionObserver;


  private hasEntered =
    false;


  /* =====================================================
     LIFECYCLE
  ====================================================== */

  ngAfterViewInit(): void {

    if (
      !isPlatformBrowser(
        this.platformId
      )
    ) {
      return;
    }


    /*
     * We intentionally DO NOT start
     * the animation here.
     *
     * The component must first enter
     * the viewport.
     */

    this.setupViewportObserver();

  }


  /* =====================================================
     VIEWPORT OBSERVER
  ====================================================== */

  private setupViewportObserver(): void {

    const section =
      this.filmSection.nativeElement;


    this.observer =
      new IntersectionObserver(
        (
          entries
        ) => {

          const entry =
            entries[0];


          if (
            entry.isIntersecting &&
            !this.hasEntered
          ) {

            this.hasEntered =
              true;


            /*
             * Stop observing after the
             * first entrance.
             */

            this.observer?.disconnect();


            this.ngZone.runOutsideAngular(() => {

              this.startFilm();

            });

          }

        },
        {
          /*
           * Start slightly before the
           * component reaches the center
           * of the screen.
           */

          threshold: 0.18,

          rootMargin:
            '0px 0px -8% 0px'
        }
      );


    this.observer.observe(
      section
    );

  }


  /* =====================================================
     START FILM
  ====================================================== */

  private startFilm(): void {

    const section =
      this.filmSection.nativeElement;


    const video =
      this.filmVideo.nativeElement;


    /* =================================================
       GSAP CONTEXT
    ================================================== */

    this.ctx =
      gsap.context(() => {

        this.prepareInitialState();

        this.playVideo();

        this.createEntranceAnimation();

        this.createVideoMovement();

      }, section);

  }


  /* =====================================================
     INITIAL STATE
  ====================================================== */

  private prepareInitialState(): void {

    gsap.set(
      '.film-frame',
      {
        opacity: 0,
        scale: 0.94
      }
    );


    gsap.set(
      '.film-video-wrap',
      {
        opacity: 0,
        scale: 0.94
      }
    );


    gsap.set(
      '.film-content',
      {
        opacity: 0,
        y: 35
      }
    );


    gsap.set(
      '.film-index',
      {
        opacity: 0,
        x: -20
      }
    );


    gsap.set(
      '.film-side-note',
      {
        opacity: 0,
        x: 20
      }
    );


    gsap.set(
      '.film-caption',
      {
        opacity: 0,
        y: 20
      }
    );


    gsap.set(
      '.film-line',
      {
        scaleX: 0,
        transformOrigin:
          'left center'
      }
    );

  }


  /* =====================================================
     VIDEO PLAY
  ====================================================== */

  private playVideo(): void {

    const video =
      this.filmVideo.nativeElement;


    /*
     * The film is always silent. The template's `muted` attribute
     * alone is not reliable (Angular sets it as an attribute, not
     * the live property), and once a visitor has interacted with
     * the site browsers allow autoplay WITH sound. So we set every
     * mute switch before play() and there is no `autoplay`
     * attribute that could start it earlier.
     */

    video.defaultMuted =
      true;

    video.muted =
      true;

    video.volume =
      0;

    video.loop =
      true;

    video.playsInline =
      true;


    const promise =
      video.play();


    /*
     * Some browsers return a Promise.
     * Autoplay can still be blocked in
     * unusual browser situations, so
     * we safely handle it.
     */

    if (
      promise !== undefined
    ) {

      promise.catch(() => {

        /*
         * Browser prevented autoplay.
         *
         * We intentionally don't
         * throw an error.
         */

      });

    }

  }


  /* =====================================================
     KEEP MUTED
     Undo any unmute (browser media controls, extensions,
     picture-in-picture) the moment it happens.
  ====================================================== */

  keepMuted(): void {

    const video =
      this.filmVideo?.nativeElement;

    if (
      video &&
      (!video.muted || video.volume > 0)
    ) {

      video.muted =
        true;

      video.volume =
        0;

    }

  }


  /* =====================================================
     ENTRANCE ANIMATION
  ====================================================== */

  private createEntranceAnimation(): void {

    const timeline =
      gsap.timeline();


    /* -----------------------------------------------
       FRAME
    ------------------------------------------------ */

    timeline.to(
      '.film-frame',
      {
        opacity: 1,

        scale: 1,

        duration: 1.4,

        ease:
          'power4.out'
      }
    );


    /* -----------------------------------------------
       VIDEO
    ------------------------------------------------ */

    timeline.to(
      '.film-video-wrap',
      {
        opacity: 1,

        scale: 1,

        duration: 1.8,

        ease:
          'power4.out'
      },
      '-=1'
    );


    /* -----------------------------------------------
       INDEX
    ------------------------------------------------ */

    timeline.to(
      '.film-index',
      {
        opacity: 1,

        x: 0,

        duration: 0.8,

        ease:
          'power3.out'
      },
      '-=1'
    );


    /* -----------------------------------------------
       CONTENT
    ------------------------------------------------ */

    timeline.to(
      '.film-content',
      {
        opacity: 1,

        y: 0,

        duration: 1,

        ease:
          'power4.out'
      },
      '-=0.65'
    );


    /* -----------------------------------------------
       SIDE NOTE
    ------------------------------------------------ */

    timeline.to(
      '.film-side-note',
      {
        opacity: 1,

        x: 0,

        duration: 0.8,

        ease:
          'power3.out'
      },
      '-=0.7'
    );


    /* -----------------------------------------------
       LINE
    ------------------------------------------------ */

    timeline.to(
      '.film-line',
      {
        scaleX: 1,

        duration: 1,

        ease:
          'power3.inOut'
      },
      '-=0.6'
    );


    /* -----------------------------------------------
       CAPTION
    ------------------------------------------------ */

    timeline.to(
      '.film-caption',
      {
        opacity: 1,

        y: 0,

        duration: 0.8,

        ease:
          'power3.out'
      },
      '-=0.5'
    );

  }


  /* =====================================================
     VIDEO MOVEMENT
     
     Very subtle cinematic Ken Burns effect.
  ====================================================== */

  private createVideoMovement(): void {

    gsap.to(
      '.film-video',
      {
        scale: 1.08,

        xPercent: -1.5,

        yPercent: -1,

        duration: 18,

        ease: 'none',

        repeat: -1,

        yoyo: true
      }
    );

  }


  /* =====================================================
     DESTROY
  ====================================================== */

  ngOnDestroy(): void {

    this.observer?.disconnect();

    this.ctx?.revert();


    if (
      this.filmVideo &&
      isPlatformBrowser(this.platformId)
    ) {

      const video =
        this.filmVideo.nativeElement;


      video.pause();

      video.removeAttribute(
        'src'
      );

      video.load();

    }

  }

}
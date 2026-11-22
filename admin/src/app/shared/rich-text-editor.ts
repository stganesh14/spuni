import { SecurityContext } from '@angular/core';
import { AfterViewInit, Component, ElementRef, forwardRef, inject, viewChild } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { DomSanitizer } from '@angular/platform-browser';

@Component({
  selector: 'app-rich-text-editor',
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => RichTextEditor), multi: true }],
  template: `
    <div class="editor">
      <div class="toolbar" role="toolbar" aria-label="Blog content formatting">
        <button type="button" aria-label="Bold" title="Bold" (mousedown)="$event.preventDefault()" (click)="format('bold')"><b>B</b></button>
        <button type="button" aria-label="Italic" title="Italic" (mousedown)="$event.preventDefault()" (click)="format('italic')"><i>I</i></button>
        <button type="button" aria-label="Underline" title="Underline" (mousedown)="$event.preventDefault()" (click)="format('underline')"><u>U</u></button>
        <span aria-hidden="true"></span>
        <button type="button" aria-label="Heading 2" title="Heading 2" (mousedown)="$event.preventDefault()" (click)="formatBlock('h2')">H2</button>
        <button type="button" aria-label="Heading 3" title="Heading 3" (mousedown)="$event.preventDefault()" (click)="formatBlock('h3')">H3</button>
        <button type="button" aria-label="Block quote" title="Block quote" (mousedown)="$event.preventDefault()" (click)="formatBlock('blockquote')">❝</button>
        <span aria-hidden="true"></span>
        <button type="button" aria-label="Bulleted list" title="Bulleted list" (mousedown)="$event.preventDefault()" (click)="format('insertUnorderedList')">• List</button>
        <button type="button" aria-label="Numbered list" title="Numbered list" (mousedown)="$event.preventDefault()" (click)="format('insertOrderedList')">1. List</button>
      </div>
      <div
        #surface
        class="surface"
        contenteditable="true"
        role="textbox"
        aria-label="Blog post content"
        aria-multiline="true"
        spellcheck="true"
        (focus)="setParagraphMode()"
        (input)="onInput()"
        (blur)="onTouched()"
        (paste)="pasteText($event)"
        (drop)="dropText($event)"
      ></div>
    </div>
  `,
  styles: `
    .editor { overflow: hidden; border: 1px solid var(--line); border-radius: 12px; background: var(--surface); }
    .toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; padding: 8px; border-bottom: 1px solid var(--line); background: var(--cream-light); }
    .toolbar button { min-width: 34px; min-height: 32px; border: 0; border-radius: 7px; background: transparent; color: var(--ink); cursor: pointer; }
    .toolbar button:hover, .toolbar button:focus-visible { background: var(--line); outline: none; }
    .toolbar span { width: 1px; height: 22px; margin: 0 4px; background: var(--line); }
    .surface { min-height: 280px; max-height: 55vh; overflow-y: auto; padding: 16px; outline: none; line-height: 1.65; }
    .surface:focus { box-shadow: inset 0 0 0 2px var(--gold); }
    .surface :first-child { margin-top: 0; }
    .surface :last-child { margin-bottom: 0; }
  `,
})
export class RichTextEditor implements ControlValueAccessor, AfterViewInit {
  private readonly sanitizer = inject(DomSanitizer);
  private readonly surface = viewChild<ElementRef<HTMLDivElement>>('surface');
  private content = '';
  private ready = false;
  private disabled = false;
  private onChange: (value: string) => void = () => {};
  protected onTouched: () => void = () => {};

  ngAfterViewInit(): void {
    this.ready = true;
    this.syncContent();
  }

  writeValue(value: string | null): void {
    this.content = value ?? '';
    this.syncContent();
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(disabled: boolean): void {
    this.disabled = disabled;
    const surface = this.surface()?.nativeElement;
    if (surface) surface.contentEditable = String(!disabled);
  }

  protected format(command: string): void {
    if (this.disabled) return;
    this.surface()?.nativeElement.focus();
    document.execCommand(command, false);
    this.emitContent();
  }

  protected formatBlock(tag: string): void {
    if (this.disabled) return;
    this.surface()?.nativeElement.focus();
    document.execCommand('formatBlock', false, `<${tag}>`);
    this.emitContent();
  }

  protected onInput(): void {
    this.emitContent();
  }

  protected setParagraphMode(): void {
    if (!this.disabled) document.execCommand('defaultParagraphSeparator', false, 'p');
  }

  protected pasteText(event: ClipboardEvent): void {
    event.preventDefault();
    this.insertText(event.clipboardData?.getData('text/plain') ?? '');
  }

  protected dropText(event: DragEvent): void {
    event.preventDefault();
    this.insertText(event.dataTransfer?.getData('text/plain') ?? '');
  }

  private insertText(text: string): void {
    this.surface()?.nativeElement.focus();
    document.execCommand('insertText', false, text);
    this.emitContent();
  }

  private emitContent(): void {
    const value = this.surface()?.nativeElement.innerHTML ?? '';
    this.content = value;
    this.onChange(value);
  }

  private syncContent(): void {
    const surface = this.surface()?.nativeElement;
    if (!surface || !this.ready) return;
    surface.innerHTML = this.sanitizer.sanitize(SecurityContext.HTML, this.content) ?? '';
    surface.contentEditable = String(!this.disabled);
  }
}

import { Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { AdminApi } from '../../core/api.service';
import { applyServerErrors, toApiError } from '../../core/errors';
import { nullIfBlank, slugify } from '../../core/format';
import { BlogPost, BlogPostIn, BlogStatus } from '../../core/models';
import { ConfirmService, ToastService } from '../../core/ui.service';
import { PATTERNS } from '../../core/validators';
import { ImageUpload } from '../../shared/image-upload';
import { ModalComponent } from '../../shared/modal';
import { DatePipe, MediaPipe } from '../../shared/pipes';
import { FieldComponent, PageHeader, StateComponent, StatusBadge } from '../../shared/ui';
import { RichTextEditor } from '../../shared/rich-text-editor';

function buildForm() {
  return new FormGroup({
    title: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(2), Validators.maxLength(160)],
    }),
    slug: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(2), Validators.maxLength(140), Validators.pattern(PATTERNS.slug)],
    }),
    excerpt: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(320)] }),
    content: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    image_url: new FormControl<string | null>(null),
    status: new FormControl<BlogStatus>('draft', { nonNullable: true }),
  });
}

@Component({
  selector: 'app-blogs',
  imports: [
    ReactiveFormsModule,
    PageHeader,
    StateComponent,
    StatusBadge,
    FieldComponent,
    ModalComponent,
    ImageUpload,
    MediaPipe,
    DatePipe,
    RichTextEditor,
  ],
  templateUrl: './blogs.html',
  styleUrl: './blogs.scss',
})
export class BlogsPage {
  private readonly api = inject(AdminApi);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);

  protected readonly items = signal<BlogPost[] | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly editing = signal<BlogPost | 'new' | null>(null);
  protected readonly saving = signal(false);
  protected readonly formError = signal<string | null>(null);
  protected readonly form = buildForm();
  private slugTouched = false;

  constructor() {
    this.form.controls.title.valueChanges.subscribe((title) => {
      if (!this.slugTouched) this.form.controls.slug.setValue(slugify(title), { emitEvent: false });
    });
    void this.load();
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      this.items.set(await firstValueFrom(this.api.blogs()));
    } catch (err) {
      this.error.set(toApiError(err).message);
    } finally {
      this.loading.set(false);
    }
  }

  protected open(post: BlogPost | 'new'): void {
    this.formError.set(null);
    if (post === 'new') {
      this.slugTouched = false;
      this.form.reset({ title: '', slug: '', excerpt: '', content: '', image_url: null, status: 'draft' });
    } else {
      this.slugTouched = true;
      this.form.reset({
        title: post.title,
        slug: post.slug,
        excerpt: post.excerpt ?? '',
        content: post.content,
        image_url: post.image_url,
        status: post.status,
      });
    }
    this.editing.set(post);
  }

  protected onSlugInput(): void {
    this.slugTouched = true;
  }

  protected async save(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    const values = this.form.getRawValue();
    const body: BlogPostIn = {
      title: values.title.trim(),
      slug: values.slug.trim(),
      excerpt: nullIfBlank(values.excerpt),
      content: values.content,
      image_url: values.image_url,
      status: values.status,
    };
    const editing = this.editing();
    this.saving.set(true);
    this.formError.set(null);
    try {
      if (editing === 'new') await firstValueFrom(this.api.createBlog(body));
      else if (editing) await firstValueFrom(this.api.updateBlog(editing.id, body));
      this.toast.success(editing === 'new' ? 'Blog post created.' : 'Blog post saved.');
      this.editing.set(null);
      void this.load();
    } catch (err) {
      const error = toApiError(err);
      applyServerErrors(this.form, error);
      this.formError.set(error.message);
    } finally {
      this.saving.set(false);
    }
  }

  protected async remove(post: BlogPost): Promise<void> {
    const ok = await this.confirm.ask({
      title: `Delete “${post.title}”?`,
      message: 'This permanently removes the blog post.',
      confirmText: 'Delete post',
      danger: true,
    });
    if (!ok) return;
    try {
      await firstValueFrom(this.api.deleteBlog(post.id));
      this.toast.success('Blog post deleted.');
      void this.load();
    } catch (err) {
      this.toast.error(toApiError(err).message);
    }
  }

  protected editTitle(): string {
    const post = this.editing();
    return post === 'new' ? 'New blog post' : post ? `Edit ${post.title}` : '';
  }
}

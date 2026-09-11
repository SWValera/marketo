"use client";

/* eslint-disable @next/next/no-img-element */
import {type KeyboardEvent, useLayoutEffect, useRef, useState} from 'react';
import {createPortal} from 'react-dom';
import {ChevronLeft, ChevronRight, X} from 'lucide-react';
import {useI18n} from '@/components/i18n-provider';
import {activateModalFocus} from '@/lib/browser/modal';
import {galleryIndex, galleryTarget} from '@/lib/media/gallery-position';

export function ListingGallery({images, title}: {images: readonly string[]; title: string}) {
  const {t} = useI18n();
  const track = useRef<HTMLDivElement>(null);
  const viewerTrack = useRef<HTMLDivElement>(null);
  const viewer = useRef<HTMLDivElement>(null);
  const openingIndex = useRef(0);
  const selectedIndex = useRef(0);
  const [position, setPosition] = useState(0);
  const [open, setOpen] = useState(false);
  const current = galleryTarget(position, images.length);

  function select(index: number) {
    const next = galleryTarget(index, images.length);
    for (const element of [track.current, viewerTrack.current]) {
      if (element?.clientWidth) element.scrollTo({left: element.clientWidth * next, behavior: 'instant'});
    }
    selectedIndex.current = next;
    setPosition(next);
  }

  useLayoutEffect(() => {
    if (!open || !viewer.current) return;
    const body = document.body;
    const scrollX = window.scrollX;
    const scrollY = window.scrollY;
    const previous = {overflow: body.style.overflow, position: body.style.position, top: body.style.top,
      left: body.style.left, right: body.style.right, width: body.style.width, paddingRight: body.style.paddingRight};
    const scrollbar = window.innerWidth - document.documentElement.clientWidth;
    if (scrollbar > 0) body.style.setProperty('padding-right', `${parseFloat(getComputedStyle(body).paddingRight) + scrollbar}px`);
    Object.assign(body.style, {overflow: 'hidden', position: 'fixed', top: `-${scrollY}px`, left: '0', right: '0', width: '100%'});
    const element = viewerTrack.current;
    if (element) element.scrollTo({left: element.clientWidth * openingIndex.current, behavior: 'instant'});
    const releaseFocus = activateModalFocus(viewer.current, () => setOpen(false));
    const normal = track.current;
    return () => {
      Object.assign(body.style, previous);
      window.scrollTo({left: scrollX, top: scrollY, behavior: 'instant'});
      releaseFocus();
      // The selected photo may have changed while the dialog was open.
      window.requestAnimationFrame(() => {
        if (!normal?.isConnected) return;
        const index = galleryIndex(normal.scrollLeft, normal.clientWidth, images.length);
        normal.querySelectorAll<HTMLButtonElement>('.gallery-open')[index]?.focus({preventScroll: true});
      });
    };
  }, [open, images.length]);

  // Keep the underlying gallery aligned, without interrupting the viewer's native swipe.
  useLayoutEffect(() => {
    if (open && track.current) track.current.scrollTo({left: track.current.clientWidth * current, behavior: 'instant'});
  }, [open, current]);

  // Preserve the chosen slide across viewport/orientation changes in either mode.
  useLayoutEffect(() => {
    const element = open ? viewerTrack.current : track.current;
    if (!element) return;
    let width = element.clientWidth;
    const observer = new ResizeObserver(() => {
      if (element.clientWidth === width) return;
      width = element.clientWidth;
      element.scrollTo({left: width * selectedIndex.current, behavior: 'instant'});
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [open]);

  function navigateKeys(event: KeyboardEvent) {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || !['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
    event.preventDefault();
    select(event.key === 'Home' ? 0 : event.key === 'End' ? images.length - 1 : current + (event.key === 'ArrowRight' ? 1 : -1));
  }

  function renderTrack(fullscreen: boolean) {
    return <div className="gallery-track" ref={fullscreen ? viewerTrack : track} tabIndex={images.length > 1 ? 0 : undefined}
      aria-label={t('listing.gallery')}
      onScroll={event => {
        if (fullscreen !== open) return;
        const next = galleryIndex(event.currentTarget.scrollLeft, event.currentTarget.clientWidth, images.length);
        selectedIndex.current = next;
        setPosition(next);
      }}
      onKeyDown={navigateKeys}>
      {images.map((url, index) => {
        // Reuse the same URLs; mount only the visible slide and its swipe neighbours in the viewer.
        const photo = !fullscreen || Math.abs(index - current) <= 1 ? <img src={url}
          alt={`${title} — ${t('listing.photoNumber', {current:index + 1, total:images.length})}`}
          loading={(fullscreen ? index === current : index === 0) ? 'eager' : 'lazy'} decoding="async" draggable={false} /> : null;
        return <figure className="gallery-main gallery-slide" key={url}
          aria-label={t('listing.photoNumber', {current:index + 1, total:images.length})}>
          {fullscreen ? photo : <button type="button" className="gallery-open" tabIndex={index === current ? 0 : -1}
            aria-label={t('listing.openPhoto', {current:index + 1})} aria-haspopup="dialog"
            onClick={event => {
              event.currentTarget.focus({preventScroll: true});
              openingIndex.current = index;
              select(index);
              setOpen(true);
            }}>{photo}</button>}
        </figure>;
      })}
    </div>;
  }

  function controls() {
    return <div className="gallery-controls">
      <button type="button" onClick={() => select(current - 1)} disabled={current === 0} aria-label={t('listing.previousPhoto')}><ChevronLeft size={22} /></button>
      <span aria-live="polite" aria-atomic="true">{t('listing.photoNumber', {current:current + 1, total:images.length})}</span>
      <button type="button" onClick={() => select(current + 1)} disabled={current === images.length - 1} aria-label={t('listing.nextPhoto')}><ChevronRight size={22} /></button>
    </div>;
  }

  if (!images.length) return null;
  return <div className="listing-gallery" role="region" aria-label={t('listing.gallery')}>
    {renderTrack(false)}
    {images.length > 1 ? <>
      {controls()}
      <div className="gallery-selectors" role="group" aria-label={t('listing.gallery')}>
        {images.map((url,index) => <button type="button" key={url} onClick={() => select(index)} aria-pressed={index === current}
          aria-label={t('listing.photoNumber', {current:index + 1, total:images.length})}>{index + 1}</button>)}
      </div>
    </> : null}
    {open ? createPortal(<div className="gallery-viewer" ref={viewer} role="dialog" aria-modal="true" aria-label={t('listing.gallery')} tabIndex={-1} onKeyDown={navigateKeys}>
      <div className="gallery-viewer-toolbar">
        <button type="button" className="gallery-viewer-close" data-dialog-initial-focus aria-label={t('common.close')} onClick={() => setOpen(false)}><X size={26} /></button>
      </div>
      {renderTrack(true)}
      {images.length > 1 ? controls() : <span className="gallery-viewer-count">{t('listing.photoNumber', {current:1, total:1})}</span>}
    </div>, document.body) : null}
  </div>;
}

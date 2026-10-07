-- Allow two more engagement events: the contact form's send button and the
-- contact page's email link (js/track.js callers in contact.html).
alter table public.site_events drop constraint if exists site_events_event_check;
alter table public.site_events add constraint site_events_event_check check (event in (
  'page_view', 'matter_page_view', 'panel_open', 'gate_shown', 'signin_open',
  'signup', 'signin', 'magic_link_sent', 'full_read', 'watchlist_cta',
  'share', 'source_click', 'search', 'permalink',
  'contact_submit', 'contact_email_click'
));

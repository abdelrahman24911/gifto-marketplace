-- Sample catalog categories for local development.
--
-- Run as the table owner (e.g. `supabase db reset`, which executes seeds as
-- `postgres`). Writing categories through the API requires the platform-admin
-- role — this file is a development convenience, not a back door.
--
-- Idempotent: re-running does nothing on conflict.

insert into public.categories (name, slug, description, position) values
  ('Gift Boxes',        'gift-boxes',         'Ready-made boxes for any occasion.', 10),
  ('Flowers',           'flowers',            'Bouquets and arrangements.', 20),
  ('Chocolates & Sweets','chocolates-sweets', 'Confectionery and dessert gifts.', 30),
  ('Cakes & Baked Goods','cakes-baked-goods', 'Cakes, cookies and dessert trays.', 40),
  ('Personalized Gifts','personalized-gifts', 'Custom names, photos and messages.', 50),
  ('Toys & Kids',       'toys-kids',          'Gifts for children.', 60),
  ('Occasions',         'occasions',          'Birthdays, weddings, graduations and holidays.', 70),
  ('Corporate Gifts',   'corporate-gifts',    'Bulk and branded gifting for businesses.', 80)
on conflict (slug) do nothing;

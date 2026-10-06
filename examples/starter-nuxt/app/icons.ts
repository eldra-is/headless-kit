/**
 * Every Tabler icon this theme can render, inlined into the bundle at build time.
 *
 * An icon is a *name* in a CMS field (`feature-grid`'s per-item `icon`, `footer`'s social links),
 * so the theme cannot know at build time which file a future entry will ask for — but it can decide
 * which names it supports. That decision is this file: a name that is not a key here renders
 * nothing. That is deliberate, and it is what makes icons work on a static host: there is no server
 * route to ask, and a page rendered in the browser (a product page after its storefront load, or
 * Studio's preview after an editor types a new icon name) has nothing to fetch from.
 *
 * **To add an icon:** add one `?raw` import and one entry below, using the Tabler outline icon's
 * own name (https://tabler.io/icons). Nothing else — `useEldraIcon` resolves straight out of this
 * map, and `test/themeIcons.spec.ts` fails if a name used anywhere in the theme is missing from it.
 *
 * The import specifier goes through `@tabler/icons`'s own export map (`"./*": ["./icons/*"]`),
 * which is why it reads `@tabler/icons/outline/<name>.svg` rather than a path into the package.
 */

import adjustmentsIcon from '@tabler/icons/outline/adjustments.svg?raw';
import alertCircleIcon from '@tabler/icons/outline/alert-circle.svg?raw';
import alertTriangleIcon from '@tabler/icons/outline/alert-triangle.svg?raw';
import arrowBackUpIcon from '@tabler/icons/outline/arrow-back-up.svg?raw';
import arrowLeftIcon from '@tabler/icons/outline/arrow-left.svg?raw';
import arrowRightIcon from '@tabler/icons/outline/arrow-right.svg?raw';
import arrowsSortIcon from '@tabler/icons/outline/arrows-sort.svg?raw';
import articleIcon from '@tabler/icons/outline/article.svg?raw';
import boxIcon from '@tabler/icons/outline/box.svg?raw';
import brandAppleIcon from '@tabler/icons/outline/brand-apple.svg?raw';
import brandFacebookIcon from '@tabler/icons/outline/brand-facebook.svg?raw';
import brandInstagramIcon from '@tabler/icons/outline/brand-instagram.svg?raw';
import brandMastercardIcon from '@tabler/icons/outline/brand-mastercard.svg?raw';
import brandPaypalIcon from '@tabler/icons/outline/brand-paypal.svg?raw';
import brandPinterestIcon from '@tabler/icons/outline/brand-pinterest.svg?raw';
import brandTiktokIcon from '@tabler/icons/outline/brand-tiktok.svg?raw';
import brandVisaIcon from '@tabler/icons/outline/brand-visa.svg?raw';
import brandYoutubeIcon from '@tabler/icons/outline/brand-youtube.svg?raw';
import buildingStoreIcon from '@tabler/icons/outline/building-store.svg?raw';
import carouselHorizontalIcon from '@tabler/icons/outline/carousel-horizontal.svg?raw';
import chartBarIcon from '@tabler/icons/outline/chart-bar.svg?raw';
import checkIcon from '@tabler/icons/outline/check.svg?raw';
import chevronDownIcon from '@tabler/icons/outline/chevron-down.svg?raw';
import chevronsRightIcon from '@tabler/icons/outline/chevrons-right.svg?raw';
import circleCheckIcon from '@tabler/icons/outline/circle-check.svg?raw';
import circleXIcon from '@tabler/icons/outline/circle-x.svg?raw';
import clockIcon from '@tabler/icons/outline/clock.svg?raw';
import creditCardIcon from '@tabler/icons/outline/credit-card.svg?raw';
import cursorTextIcon from '@tabler/icons/outline/cursor-text.svg?raw';
import externalLinkIcon from '@tabler/icons/outline/external-link.svg?raw';
import fileTextIcon from '@tabler/icons/outline/file-text.svg?raw';
import gridDotsIcon from '@tabler/icons/outline/grid-dots.svg?raw';
import heartIcon from '@tabler/icons/outline/heart.svg?raw';
import helpCircleIcon from '@tabler/icons/outline/help-circle.svg?raw';
import infoCircleIcon from '@tabler/icons/outline/info-circle.svg?raw';
import layoutAlignTopIcon from '@tabler/icons/outline/layout-align-top.svg?raw';
import layoutBottombarIcon from '@tabler/icons/outline/layout-bottombar.svg?raw';
import layoutColumnsIcon from '@tabler/icons/outline/layout-columns.svg?raw';
import layoutDashboardIcon from '@tabler/icons/outline/layout-dashboard.svg?raw';
import layoutGridIcon from '@tabler/icons/outline/layout-grid.svg?raw';
import layoutNavbarIcon from '@tabler/icons/outline/layout-navbar.svg?raw';
import layoutNavbarCollapseIcon from '@tabler/icons/outline/layout-navbar-collapse.svg?raw';
import leafIcon from '@tabler/icons/outline/leaf.svg?raw';
import linkIcon from '@tabler/icons/outline/link.svg?raw';
import loader2Icon from '@tabler/icons/outline/loader-2.svg?raw';
import lockIcon from '@tabler/icons/outline/lock.svg?raw';
import mailIcon from '@tabler/icons/outline/mail.svg?raw';
import mapPinIcon from '@tabler/icons/outline/map-pin.svg?raw';
import menu2Icon from '@tabler/icons/outline/menu-2.svg?raw';
import minusIcon from '@tabler/icons/outline/minus.svg?raw';
import needleThreadIcon from '@tabler/icons/outline/needle-thread.svg?raw';
import newsIcon from '@tabler/icons/outline/news.svg?raw';
import packageIcon from '@tabler/icons/outline/package.svg?raw';
import phoneIcon from '@tabler/icons/outline/phone.svg?raw';
import photoIcon from '@tabler/icons/outline/photo.svg?raw';
import playerPlayIcon from '@tabler/icons/outline/player-play.svg?raw';
import quoteIcon from '@tabler/icons/outline/quote.svg?raw';
import receiptIcon from '@tabler/icons/outline/receipt.svg?raw';
import searchIcon from '@tabler/icons/outline/search.svg?raw';
import shieldCheckIcon from '@tabler/icons/outline/shield-check.svg?raw';
import shirtIcon from '@tabler/icons/outline/shirt.svg?raw';
import shoppingBagIcon from '@tabler/icons/outline/shopping-bag.svg?raw';
import speakerphoneIcon from '@tabler/icons/outline/speakerphone.svg?raw';
import starIcon from '@tabler/icons/outline/star.svg?raw';
import textCaptionIcon from '@tabler/icons/outline/text-caption.svg?raw';
import timelineIcon from '@tabler/icons/outline/timeline.svg?raw';
import trashIcon from '@tabler/icons/outline/trash.svg?raw';
import truckIcon from '@tabler/icons/outline/truck.svg?raw';
import userIcon from '@tabler/icons/outline/user.svg?raw';
import usersIcon from '@tabler/icons/outline/users.svg?raw';
import worldIcon from '@tabler/icons/outline/world.svg?raw';
import xIcon from '@tabler/icons/outline/x.svg?raw';
import zoomInIcon from '@tabler/icons/outline/zoom-in.svg?raw';

/**
 * The two edits every icon needs before it can be styled by the surrounding text: drop the file's
 * fixed 24×24 so `@eldrajs/ui`'s `Icon` sizes it, and let the stroke inherit `color`.
 */
function toInlineSvg(svg: string): string {
  return svg
    .replace(/\s(width|height)="24"/g, '')
    .replace(/stroke="[^"]*"/, 'stroke="currentColor"')
    .trim();
}

const RAW = {
  adjustments: adjustmentsIcon,
  'alert-circle': alertCircleIcon,
  'alert-triangle': alertTriangleIcon,
  'arrow-back-up': arrowBackUpIcon,
  'arrow-left': arrowLeftIcon,
  'arrow-right': arrowRightIcon,
  'arrows-sort': arrowsSortIcon,
  article: articleIcon,
  box: boxIcon,
  'brand-apple': brandAppleIcon,
  'brand-facebook': brandFacebookIcon,
  'brand-instagram': brandInstagramIcon,
  'brand-mastercard': brandMastercardIcon,
  'brand-paypal': brandPaypalIcon,
  'brand-pinterest': brandPinterestIcon,
  'brand-tiktok': brandTiktokIcon,
  'brand-visa': brandVisaIcon,
  'brand-youtube': brandYoutubeIcon,
  'building-store': buildingStoreIcon,
  'carousel-horizontal': carouselHorizontalIcon,
  'chart-bar': chartBarIcon,
  check: checkIcon,
  'chevron-down': chevronDownIcon,
  'chevrons-right': chevronsRightIcon,
  'circle-check': circleCheckIcon,
  'circle-x': circleXIcon,
  clock: clockIcon,
  'credit-card': creditCardIcon,
  'cursor-text': cursorTextIcon,
  'external-link': externalLinkIcon,
  'file-text': fileTextIcon,
  'grid-dots': gridDotsIcon,
  heart: heartIcon,
  'help-circle': helpCircleIcon,
  'info-circle': infoCircleIcon,
  'layout-align-top': layoutAlignTopIcon,
  'layout-bottombar': layoutBottombarIcon,
  'layout-columns': layoutColumnsIcon,
  'layout-dashboard': layoutDashboardIcon,
  'layout-grid': layoutGridIcon,
  'layout-navbar': layoutNavbarIcon,
  'layout-navbar-collapse': layoutNavbarCollapseIcon,
  leaf: leafIcon,
  link: linkIcon,
  'loader-2': loader2Icon,
  lock: lockIcon,
  mail: mailIcon,
  'map-pin': mapPinIcon,
  'menu-2': menu2Icon,
  minus: minusIcon,
  'needle-thread': needleThreadIcon,
  news: newsIcon,
  package: packageIcon,
  phone: phoneIcon,
  photo: photoIcon,
  'player-play': playerPlayIcon,
  quote: quoteIcon,
  receipt: receiptIcon,
  search: searchIcon,
  'shield-check': shieldCheckIcon,
  shirt: shirtIcon,
  'shopping-bag': shoppingBagIcon,
  speakerphone: speakerphoneIcon,
  star: starIcon,
  'text-caption': textCaptionIcon,
  timeline: timelineIcon,
  trash: trashIcon,
  truck: truckIcon,
  user: userIcon,
  users: usersIcon,
  world: worldIcon,
  x: xIcon,
  'zoom-in': zoomInIcon,
};

/** Every icon name the theme ships. Type a field, a constant or a lookup with it and an icon the
 *  theme does not bundle becomes a type error rather than a blank space. */
export type ThemeIconName = keyof typeof RAW;

/** Icon name → inline SVG markup. Unknown names are absent, and render nothing. */
export const THEME_ICONS = Object.fromEntries(
  Object.entries(RAW).map(([name, svg]) => [name, toInlineSvg(svg)])
) as Record<ThemeIconName, string>;

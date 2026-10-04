import { Anchor, Button, NavLink, type AnchorProps, type ButtonProps, type NavLinkProps } from '@mantine/core';
import { createLink, type LinkComponent } from '@tanstack/react-router';
import { forwardRef, type AnchorHTMLAttributes } from 'react';
import type { FileRouteTypes } from './routeTree.gen';

/* Mantine components wired to TanStack Router, so links keep real hrefs and typed routes. */

const AnchorBase = forwardRef<HTMLAnchorElement, AnchorProps & AnchorHTMLAttributes<HTMLAnchorElement>>((props, ref) => <Anchor ref={ref} {...props} />);
const CreatedAnchor = createLink(AnchorBase);
export const AnchorLink: LinkComponent<typeof AnchorBase> = props => <CreatedAnchor preload="intent" {...props} />;

const NavLinkBase = forwardRef<HTMLAnchorElement, NavLinkProps & AnchorHTMLAttributes<HTMLAnchorElement>>((props, ref) => <NavLink ref={ref} {...props} />);
const CreatedNavLink = createLink(NavLinkBase);
export const NavLinkRouter: LinkComponent<typeof NavLinkBase> = props => <CreatedNavLink preload="intent" {...props} />;

/** Routes without path params, which a menu item can link to directly. */
type StaticRoute = Exclude<FileRouteTypes['to'], `${string}$${string}`>;

/**
 * Link props for a menu path. Menu paths are data: one with its own route (pass `useRouter().routesByPath`) links to
 * it; one without goes through the catch-all route's `_splat` param, which shows the placeholder. Linking a real
 * route through the catch-all would make the router warn.
 */
export const menuLink = (path: string, routesByPath: object) =>
  path in routesByPath ? { to: path as StaticRoute, params: {} } : { to: '/$' as const, params: { _splat: path.slice(1) } };

const ButtonBase = forwardRef<HTMLAnchorElement, ButtonProps & AnchorHTMLAttributes<HTMLAnchorElement>>((props, ref) => <Button component="a" ref={ref} {...props} />);
const CreatedButton = createLink(ButtonBase);
export const ButtonLink: LinkComponent<typeof ButtonBase> = props => <CreatedButton preload="intent" {...props} />;

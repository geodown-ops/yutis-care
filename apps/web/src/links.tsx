import { Anchor, Button, NavLink, type AnchorProps, type ButtonProps, type NavLinkProps } from '@mantine/core';
import { createLink, type LinkComponent } from '@tanstack/react-router';
import { forwardRef, type AnchorHTMLAttributes } from 'react';

/* Mantine components wired to TanStack Router, so links keep real hrefs and typed routes. */

const AnchorBase = forwardRef<HTMLAnchorElement, AnchorProps & AnchorHTMLAttributes<HTMLAnchorElement>>((props, ref) => <Anchor ref={ref} {...props} />);
const CreatedAnchor = createLink(AnchorBase);
export const AnchorLink: LinkComponent<typeof AnchorBase> = props => <CreatedAnchor preload="intent" {...props} />;

const NavLinkBase = forwardRef<HTMLAnchorElement, NavLinkProps & AnchorHTMLAttributes<HTMLAnchorElement>>((props, ref) => <NavLink ref={ref} {...props} />);
const CreatedNavLink = createLink(NavLinkBase);
export const NavLinkRouter: LinkComponent<typeof NavLinkBase> = props => <CreatedNavLink preload="intent" {...props} />;

/**
 * Menu paths are data, so they go through the catch-all route's `_splat` param to stay type-checked;
 * the router still matches the specific route (e.g. /employees) when one exists.
 */
export const splat = (path: string) => ({ to: '/$' as const, params: { _splat: path.slice(1) } });

const ButtonBase = forwardRef<HTMLAnchorElement, ButtonProps & AnchorHTMLAttributes<HTMLAnchorElement>>((props, ref) => <Button component="a" ref={ref} {...props} />);
const CreatedButton = createLink(ButtonBase);
export const ButtonLink: LinkComponent<typeof ButtonBase> = props => <CreatedButton preload="intent" {...props} />;

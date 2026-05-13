import { NEXT_PRIVATE_SIGNING_TIMESTAMP_AUTHORITY } from '@documenso/lib/constants/app';
import { HttpTimestampAuthority } from '@libpdf/core';
import { once } from 'remeda';

export type TimestampAuthorityConfig = {
  url: string;
  authority: HttpTimestampAuthority;
};

const setupTimestampAuthorities = once(() => {
  const timestampAuthority = NEXT_PRIVATE_SIGNING_TIMESTAMP_AUTHORITY();

  if (!timestampAuthority) {
    return null;
  }

  const timestampAuthorities = timestampAuthority
    .trim()
    .split(',')
    .map((url) => url.trim())
    .filter(Boolean)
    .map((url) => {
      return {
        url,
        authority: new HttpTimestampAuthority(url),
      };
    });

  return timestampAuthorities;
});

export const getTimestampAuthority = () => {
  const authorities = setupTimestampAuthorities();

  if (!authorities) {
    return null;
  }

  return authorities[0] ?? null;
};

export const getTimestampAuthorities = () => {
  return setupTimestampAuthorities() ?? [];
};

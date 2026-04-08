import { PDF } from '@libpdf/core';
import type { Signer } from '@libpdf/core';
import { match } from 'ts-pattern';

import {
  NEXT_PRIVATE_USE_LEGACY_SIGNING_SUBFILTER,
  NEXT_PUBLIC_SIGNING_CONTACT_INFO,
  NEXT_PUBLIC_WEBAPP_URL,
} from '@documenso/lib/constants/app';
import { env } from '@documenso/lib/utils/env';

import { getTimestampAuthorities } from './helpers/tsa';
import { createGoogleCloudSigner } from './transports/google-cloud';
import { createLocalSigner } from './transports/local';

export type SignOptions = {
  pdf: PDF;
};

let signer: Signer | null = null;

const getSigner = async () => {
  if (signer) {
    return signer;
  }

  const transport = env('NEXT_PRIVATE_SIGNING_TRANSPORT') || 'local';

  // eslint-disable-next-line require-atomic-updates
  signer = await match(transport)
    .with('local', async () => await createLocalSigner())
    .with('gcloud-hsm', async () => await createGoogleCloudSigner())
    .otherwise(() => {
      throw new Error(`Unsupported signing transport: ${transport}`);
    });

  return signer;
};

export const signPdf = async ({ pdf }: SignOptions) => {
  const signer = await getSigner();
  const timestampAuthorities = getTimestampAuthorities();

  const signOptions = {
    signer,
    reason: 'Signed by Documenso',
    location: NEXT_PUBLIC_WEBAPP_URL(),
    contactInfo: NEXT_PUBLIC_SIGNING_CONTACT_INFO(),
    subFilter: NEXT_PRIVATE_USE_LEGACY_SIGNING_SUBFILTER()
      ? 'adbe.pkcs7.detached'
      : 'ETSI.CAdES.detached',
  } as const;

  if (timestampAuthorities.length === 0) {
    const { bytes } = await pdf.sign(signOptions);

    return bytes;
  }

  const unsignedPdfBytes = await pdf.save({ useXRefStream: true });
  const tsaErrors: string[] = [];

  for (const tsa of timestampAuthorities) {
    try {
      console.info(`[signing] Using timestamp authority: ${tsa.url}`);

      const pdfToSign = await PDF.load(unsignedPdfBytes);

      const { bytes } = await pdfToSign.sign({
        ...signOptions,
        timestampAuthority: tsa.authority,
        longTermValidation: true,
        archivalTimestamp: true,
      });

      return bytes;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      tsaErrors.push(`${tsa.url}: ${message}`);

      console.warn(`[signing] Timestamp authority failed: ${tsa.url} - ${message}`);
    }
  }

  throw new Error(
    `Failed to sign PDF with all configured timestamp authorities. ${tsaErrors.join(' | ')}`,
  );
};

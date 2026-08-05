"use client";

import type { IntegrationSecretMeta } from "../../../lib/types";
import { ChannelTextField } from "./ChannelTextField";
import { SecretField } from "./SecretField";

export interface TwilioByoFieldsProps {
  numberLabel: string;
  numberPlaceholder: string;
  helper: string;
  accountSid: string;
  phoneNumber: string;
  onAccountSidChange: (value: string) => void;
  onPhoneNumberChange: (value: string) => void;
  authTokenMeta: IntegrationSecretMeta | null;
  onAuthTokenChange: (value: string | null) => void;
  disabled: boolean;
}

/**
 * `Account SID de Twilio` + `Auth Token` (`SecretField`) + a channel-specific
 * number field — identical fieldset for WhatsApp and Teléfono BYO (both are
 * Twilio subaccount credentials, 08-14-SUMMARY.md's field-name table), so
 * both `WhatsAppFields` and `PhoneFields` render this instead of duplicating it.
 */
export function TwilioByoFields({
  numberLabel,
  numberPlaceholder,
  helper,
  accountSid,
  phoneNumber,
  onAccountSidChange,
  onPhoneNumberChange,
  authTokenMeta,
  onAuthTokenChange,
  disabled
}: TwilioByoFieldsProps): React.ReactElement {
  return (
    <div className="mt-4 max-w-md space-y-4">
      <ChannelTextField
        disabled={disabled}
        label="Account SID de Twilio"
        onChange={onAccountSidChange}
        placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
        value={accountSid}
      />
      <SecretField
        disabled={disabled}
        label="Auth Token"
        meta={authTokenMeta}
        name="authToken"
        onChange={onAuthTokenChange}
      />
      <ChannelTextField
        disabled={disabled}
        label={numberLabel}
        onChange={onPhoneNumberChange}
        placeholder={numberPlaceholder}
        value={phoneNumber}
      />
      <p className="text-xs text-slate-500">{helper}</p>
    </div>
  );
}

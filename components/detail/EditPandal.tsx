"use client";

import { useState } from "react";
import { Modal } from "@/components/Modal";
import { TAGS } from "@/lib/config";
import { updatePandal } from "@/lib/data";
import { errorKey } from "@/lib/errors";
import { useI18n, type Key } from "@/lib/i18n";
import type { PandalDetail, PlaceKind } from "@/lib/types";

/** Lets the person who added the pandal change the text. The pin is not editable here. */
export function EditPandal({
  pandal,
  userId,
  onClose,
  onSaved,
}: {
  pandal: PandalDetail;
  userId: string;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const { t } = useI18n();
  const [name, setName] = useState(pandal.name);
  const [kind, setKind] = useState<PlaceKind>(pandal.kind);
  const [description, setDescription] = useState(pandal.description ?? "");
  const [address, setAddress] = useState(pandal.address ?? "");
  const [tags, setTags] = useState<string[]>(pandal.tags.filter((tag) => (TAGS as readonly string[]).includes(tag)));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const nameOk = name.trim().length >= 2;

  const save = async () => {
    if (!nameOk || busy) return;
    setBusy(true);
    setErr(null);
    try {
      await updatePandal(
        pandal.id,
        { name, description, address, tags, kind },
        userId,
      );
      onSaved(t("editSaved"));
      onClose();
    } catch (e) {
      setErr(t(errorKey(e)));
      setBusy(false);
    }
  };

  return (
    <Modal title={t("editPandalTitle")} onClose={onClose} testId="edit-pandal">
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <fieldset>
          <legend className="mb-1.5 text-base font-semibold">{t("whatKind")}</legend>
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              aria-pressed={kind === "pandal"}
              onClick={() => setKind("pandal")}
              className={`min-h-12 rounded-xl border-2 px-2 text-sm ${
                kind === "pandal" ? "border-vermilion bg-ivory font-semibold text-vermilion-ink" : "border-line bg-ivory"
              }`}
              data-testid="edit-kind-pandal"
            >
              {t("kindPandal")}
            </button>
            <button
              type="button"
              aria-pressed={kind === "ramleela"}
              onClick={() => setKind("ramleela")}
              className={`min-h-12 rounded-xl border-2 px-2 text-sm ${
                kind === "ramleela" ? "border-ramleela bg-ramleela-soft font-semibold text-ramleela" : "border-line bg-ivory"
              }`}
              data-testid="edit-kind-ramleela"
            >
              {t("kindRamleela")}
            </button>
            <button
              type="button"
              aria-pressed={kind === "ravan"}
              onClick={() => setKind("ravan")}
              className={`min-h-12 rounded-xl border-2 px-2 text-sm ${
                kind === "ravan" ? "border-ravan bg-ravan-soft font-semibold text-ravan" : "border-line bg-ivory"
              }`}
              data-testid="edit-kind-ravan"
            >
              {t("kindRavan")}
            </button>
          </div>
          {kind === "ramleela" && <p className="mt-2 text-sm text-ink-2">{t("ramleelaNote")}</p>}
          {kind === "ravan" && <p className="mt-2 text-sm text-ink-2">{t("ravanNote")}</p>}
        </fieldset>
        <label className="block text-base font-semibold" htmlFor="edit-name">
          {kind === "ramleela" ? t("ramleelaName") : kind === "ravan" ? t("ravanName") : t("pandalName")}
        </label>
        <input
          id="edit-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={120}
          required
          className="h-12 w-full rounded-xl border-2 border-line bg-ivory px-3"
          data-testid="edit-name"
        />
        {!nameOk && (
          <p className="-mt-2 text-sm font-medium text-vermilion-ink" role="alert">
            {t("nameError")}
          </p>
        )}
        <label className="block text-base font-semibold" htmlFor="edit-address">
          {t("area")} <span className="font-normal text-ink-2">({t("optional")})</span>
        </label>
        <input
          id="edit-address"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          maxLength={200}
          className="h-12 w-full rounded-xl border-2 border-line bg-ivory px-3"
          placeholder={t("areaPlaceholder")}
          data-testid="edit-address"
        />
        <label className="block text-base font-semibold" htmlFor="edit-description">
          {t("special")} <span className="font-normal text-ink-2">({t("optional")})</span>
        </label>
        <textarea
          id="edit-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={1000}
          rows={4}
          className="w-full rounded-xl border-2 border-line bg-ivory px-3 py-2"
          data-testid="edit-description"
        />
        <fieldset>
          <legend className="mb-1.5 text-base font-semibold">
            {t("tags")} <span className="font-normal text-ink-2">({t("tagsOptional")})</span>
          </legend>
          <div className="flex flex-wrap gap-2">
            {TAGS.map((tag) => {
              const on = tags.includes(tag);
              return (
                <button
                  key={tag}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setTags(on ? tags.filter((x) => x !== tag) : [...tags, tag])}
                  className={`h-12 rounded-full border-2 px-4 text-base ${
                    on ? "border-marigold bg-marigold-soft font-semibold" : "border-line bg-paper"
                  }`}
                >
                  {t(`tag.${tag}` as Key)}
                </button>
              );
            })}
          </div>
        </fieldset>
        <p className="text-sm text-ink-2">{t("editPinStays")}</p>
        {err && (
          <p className="text-base font-medium text-vermilion-ink" role="alert">
            {err}
          </p>
        )}
        <button
          type="submit"
          disabled={!nameOk || busy}
          className="h-14 rounded-2xl bg-vermilion text-lg font-bold text-white disabled:opacity-60"
          data-testid="edit-save"
        >
          {busy ? t("saving") : t("saveChanges")}
        </button>
      </form>
    </Modal>
  );
}

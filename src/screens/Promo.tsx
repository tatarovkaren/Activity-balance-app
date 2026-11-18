// Промокоды кураторов: ввод кода клиентом (анкета, профиль), предложение со скидкой после ведения,
// и в кабинете куратора — код, ссылка-приглашение, места в тарифе, кто пришёл по коду, бонус.

import React, { useEffect, useState } from 'react';
import { Platform, Share, View } from 'react-native';
import { todayISO } from '../core/dates';
import {
  CURATOR_LIMITS,
  CURATOR_PLANS,
  REFERRAL,
  activeCount,
  curatorBonus,
  inviteLink,
  latinSurname,
  normalizeCode,
  offerOpen,
  seatsLeft,
  surnameOk,
  type CuratorAccount,
  type CuratorPlan,
  type Referral,
} from '../core/promo';
import { SELF_ID, useStore } from '../data/store';
import { Btn, Card, Divider, Fields, Gap, Note, Row, Seg, T, TextField } from '../ui/kit';
import { useTheme } from '../ui/theme';
import { errorText, useI18n } from '../i18n';

/** Поле «код куратора» + кнопка. Код из ссылки-приглашения подставляется сам. */
export function CodeEntry({ testID = 'curatorCode', onLinked }: { testID?: string; onLinked?: () => void }) {
  const t = useTheme();
  const L = useI18n();
  const Pr = L.tx.promo;
  const { data, session, linkByCode } = useStore();
  const [code, setCode] = useState(data.invite || '');
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (data.invite) setCode(data.invite);
  }, [data.invite]);
  const norm = normalizeCode(code);
  const submit = async () => {
    setBusy(true);
    try {
      const err = await linkByCode(code, data.profile.name.trim() || L.tx.curatorPromo.selfName);
      if (err) setMsg({ text: Pr.errors[err], ok: false });
      else {
        setMsg(null);
        onLinked?.();
      }
    } catch (e) {
      setMsg({ text: errorText(L, e), ok: false });
    } finally {
      setBusy(false);
    }
  };
  const acc = data.curatorAccount;
  return (
    <View>
      <T muted size={13}>{Pr.codeIntro}</T>
      {data.invite ? <T size={13} color={t.green}>{Pr.fromInvite(data.invite)}</T> : null}
      <Gap h={6} />
      <Fields>
        <TextField value={code} onChange={(v) => { setCode(v); setMsg(null); }} placeholder={Pr.codePh} testID={testID} />
        <Btn small title={Pr.link} disabled={busy || norm.length < 6} onPress={submit} testID={testID + 'Btn'} />
      </Fields>
      {code.trim() && norm !== code.trim() ? <T muted size={12} mono>{norm}</T> : null}
      {session.mode === 'demo' && acc ? <T muted size={12}>{Pr.demoHint(acc.code)}</T> : null}
      {session.mode === 'local' ? <T muted size={12}>{Pr.localHint}</T> : null}
      {msg ? <Note color={msg.ok ? t.green : t.red}>{msg.text}</Note> : null}
    </View>
  );
}

/** Ведение закончилось: Премиум со скидкой (оплата пока не подключена). */
export function OfferCard() {
  const t = useTheme();
  const { tx, f } = useI18n();
  const Pr = tx.promo;
  const { data, session, acceptOffer, dismissOffer } = useStore();
  const o = data.offer;
  const today = todayISO();
  if (!o) return null;
  if (o.acceptedAt)
    return o.discountUntil && today <= o.discountUntil ? (
      <Card title={Pr.offerTitle} accent={t.green}>
        <T size={13}>{Pr.offerDone(f.dmy(o.discountUntil))}</T>
      </Card>
    ) : null;
  if (!offerOpen(o, today)) return null;
  return (
    <Card title={Pr.offerTitle} accent={t.green}>
      <T size={14} style={{ marginBottom: 8 }}>{Pr.offer(o.curatorName, o.discountPct, o.months, f.dmy(o.until))}</T>
      {session.mode === 'cloud' ? (
        <T muted size={12}>{Pr.offerCloud}</T>
      ) : (
        <Row>
          <Btn small kind="solid" color={t.green} title={Pr.offerAccept(o.discountPct)} onPress={acceptOffer} testID="offerAccept" />
          <Btn small title={Pr.offerLater} onPress={dismissOffer} />
        </Row>
      )}
    </Card>
  );
}

// ---- Кабинет куратора ----

function copyText(text: string): Promise<boolean> {
  try {
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) return navigator.clipboard.writeText(text).then(() => true, () => false);
  } catch {
    /* ignore */
  }
  return Promise.resolve(false);
}

function appBase(): string {
  if (Platform.OS === 'web' && typeof window !== 'undefined') return window.location.origin + window.location.pathname;
  // на телефоне — адрес веб-версии; домен ещё не выбран, поэтому ссылка пока только для веба
  return '';
}

/** Короткая строка для боковой панели кабинета: код и занятые места. */
export function PromoSidebar({ acc }: { acc: CuratorAccount | undefined }) {
  const { tx } = useI18n();
  const C = tx.curator;
  const Q = tx.curatorPromo;
  if (!acc) return <T muted size={12}>{Q.sidebarNone}</T>;
  return (
    <>
      <T muted size={12}>
        {Q.plans[acc.plan]} · {Q.seatsShort(activeCount(acc), CURATOR_LIMITS[acc.plan].seats)}
      </T>
      <T muted size={12}>
        {C.invite}
        <T mono bold size={12}>{acc.code}</T>
      </T>
    </>
  );
}

export interface PromoActions {
  create: (surname: string, displayName: string) => Promise<void> | void;
  setPlan?: (p: CuratorPlan) => void;
  end: (id: string, how: 'ended' | 'removed') => Promise<void> | void;
}

/** Код, ссылка, тариф и места; ниже — кто пришёл по коду. */
export function PromoPanel({ acc, actions, err }: { acc: CuratorAccount | undefined; actions: PromoActions; err?: string }) {
  const t = useTheme();
  const L = useI18n();
  const { tx, f } = L;
  const Q = tx.curatorPromo;
  const [surname, setSurname] = useState('');
  const [display, setDisplay] = useState('');
  const [note, setNote] = useState<{ text: string; ok: boolean } | null>(null);

  if (!acc) {
    const latin = latinSurname(surname);
    return (
      <Card title={Q.title} accent={t.amber}>
        <T muted size={13}>{Q.surnameIntro}</T>
        <Gap h={6} />
        <Fields min={140}>
          <TextField label={Q.surname} value={surname} onChange={(v) => { setSurname(v); setNote(null); }} testID="promoSurname" />
          <TextField label={Q.displayName} value={display} onChange={setDisplay} placeholder={Q.displayPh} testID="promoDisplay" />
        </Fields>
        {latin.length >= 2 ? <T muted size={12}>{Q.preview(latin)}</T> : null}
        <Gap h={6} />
        <Btn
          small
          kind="solid"
          title={Q.create}
          disabled={!surname.trim()}
          onPress={async () => {
            if (!surnameOk(surname)) return setNote({ text: Q.badSurname, ok: false });
            try {
              await actions.create(surname, display || surname);
            } catch (e) {
              setNote({ text: errorText(L, e), ok: false });
            }
          }}
          testID="promoCreate"
        />
        {note ? <Note color={note.ok ? t.green : t.red}>{note.text}</Note> : null}
        {err ? <Note color={t.red}>{err}</Note> : null}
      </Card>
    );
  }

  const lim = CURATOR_LIMITS[acc.plan];
  const used = activeCount(acc);
  const left = seatsLeft(acc);
  const base = appBase();
  const link = base ? inviteLink(base, acc.code) : '';
  const share = async () => {
    const text = Q.shareText(acc.displayName, acc.code) + (link ? '\n' + link : '');
    try {
      if (Platform.OS === 'web') {
        const nav = typeof navigator !== 'undefined' ? (navigator as Navigator & { share?: (d: { text: string; url?: string }) => Promise<void> }) : undefined;
        if (nav?.share) await nav.share({ text: Q.shareText(acc.displayName, acc.code), url: link || undefined });
        else if (await copyText(text)) setNote({ text: Q.copied, ok: true });
      } else await Share.share({ message: text });
    } catch {
      /* пользователь закрыл окно «Поделиться» */
    }
  };
  const bonus = curatorBonus(acc);
  const list = [...acc.referrals].sort((a, b) => (a.status === b.status ? (a.linkedAt < b.linkedAt ? 1 : -1) : a.status === 'active' ? -1 : b.status === 'active' ? 1 : 0));

  return (
    <>
      <Card title={Q.title} accent={t.amber}>
        <Row style={{ flexWrap: 'wrap' }}>
          <T muted size={12}>{Q.code}</T>
          <T mono bold size={22} color={t.amber} style={{ letterSpacing: 1 }}>{acc.code}</T>
        </Row>
        {link ? (
          <>
            <Gap h={4} />
            <T muted size={12}>{Q.link}</T>
            <T mono size={12} style={{ marginBottom: 6 }}>{link}</T>
          </>
        ) : null}
        <Row style={{ flexWrap: 'wrap' }}>
          {link ? <Btn small title={Q.copy} onPress={async () => setNote((await copyText(link)) ? { text: Q.copied, ok: true } : null)} testID="promoCopy" /> : null}
          <Btn small title={Q.share} onPress={share} />
        </Row>
        {note ? <Note color={note.ok ? t.green : t.red}>{note.text}</Note> : null}
        <Divider />
        <T size={13}>{Q.planLine(Q.plans[acc.plan], used, lim.seats, lim.photosPerDay)}</T>
        <T size={13} color={left ? t.green : t.red}>{left ? Q.seatsLeft(left) : Q.noSeats}</T>
        {actions.setPlan ? (
          <>
            <Gap h={6} />
            <Seg<CuratorPlan> value={acc.plan} onChange={actions.setPlan} options={CURATOR_PLANS.map((p) => ({ v: p, label: `${Q.plans[p]} · ${CURATOR_LIMITS[p].seats}` }))} testID="promoPlan" />
            <T muted size={12}>{Q.planDemo}</T>
          </>
        ) : null}
        {err ? <Note color={t.red}>{err}</Note> : null}
      </Card>

      <Card title={Q.referralsTitle} accent={t.blue}>
        {!list.length ? <T muted size={13}>{Q.none}</T> : null}
        {list.map((r) => (
          referralRow(r, (how) => actions.end(r.id, how))
        ))}
        <Divider />
        <T size={13}>{Q.bonus(bonus.paid, bonus.months, bonus.toNext)}</T>
        <T muted size={12}>{Q.bonusNote}</T>
        <T muted size={12}>{Q.endHint(REFERRAL.discountPct, REFERRAL.months)}</T>
      </Card>
    </>
  );

  function referralRow(r: Referral, onEnd: (how: 'ended' | 'removed') => void) {
    const on = r.status === 'active';
    return (
      <View key={r.id} style={{ paddingVertical: 6, borderBottomWidth: 1, borderColor: t.line }} testID={'ref-' + r.id}>
        <Row style={{ flexWrap: 'wrap' }}>
          <T size={14} bold={r.id === SELF_ID} style={{ flex: 1, minWidth: 140 }}>{r.name}</T>
          <T size={12} color={on ? t.green : t.muted}>
            {Q.status[r.status]} · {Q.since(f.dm(r.linkedAt))}
            {r.endedAt ? ' ' + Q.until(f.dm(r.endedAt)) : ''}
          </T>
        </Row>
        {r.paidAt ? <T size={12} color={t.violet}>{Q.paid}</T> : null}
        {on ? (
          <Row style={{ marginTop: 4 }}>
            <Btn small title={Q.end} onPress={() => onEnd('ended')} testID={'refEnd-' + r.id} />
            <Btn small title={Q.remove} color={t.red} onPress={() => onEnd('removed')} testID={'refRemove-' + r.id} />
          </Row>
        ) : null}
      </View>
    );
  }
}

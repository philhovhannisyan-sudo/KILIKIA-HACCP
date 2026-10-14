import { useEffect, useState } from 'react';
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ArrowDown, ArrowUp, GripVertical, Plus, Save, Trash2 } from 'lucide-react';
import { useI18n } from '../../i18n/I18nProvider';
import { ActionButton } from '../../components/Can';
import { editText, type ScreenProps } from './common';

// orig — исходное имя: неизменённые названия не отправляются, чтобы не терять переводы справочника
interface Item { key: string; id?: string; name: string; orig?: string }

// Экран 3 — схема процесса с перетаскиванием и подтверждение на месте (шаги Codex 4–5)
export function ScreenFlow({ data, editable, save }: ScreenProps) {
  const { t, lang } = useI18n();
  const fromData = () => data.steps.map((s) => ({ key: s.id, id: s.id, name: editText(s.name_i18n, lang), orig: editText(s.name_i18n, lang) }));
  const [items, setItems] = useState<Item[]>(fromData);
  const [newName, setNewName] = useState('');
  const [date, setDate] = useState(data.plan.site_verified_date ?? '');
  const [by, setBy] = useState(data.plan.site_verified_by ?? '');
  useEffect(() => { setItems(fromData()); setDate(data.plan.site_verified_date ?? ''); setBy(data.plan.site_verified_by ?? ''); }, [data, lang]); // eslint-disable-line react-hooks/exhaustive-deps

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    const from = items.findIndex((i) => i.key === e.active.id);
    const to = items.findIndex((i) => i.key === e.over!.id);
    setItems(arrayMove(items, from, to));
  };
  const move = (i: number, d: number) => setItems(arrayMove(items, i, i + d));

  return (
    <div className="form form--wide">
      <p className="muted">{t('wizard.hint.3')}</p>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={items.map((i) => i.key)} strategy={verticalListSortingStrategy}>
          <ol className="flow" data-testid="flow-list">
            {items.map((it, i) => (
              <SortableStep key={it.key} item={it} index={i} editable={editable} count={items.length}
                onName={(name) => setItems(items.map((x) => (x.key === it.key ? { ...x, name } : x)))}
                onMove={(d) => move(i, d)} onRemove={() => setItems(items.filter((x) => x.key !== it.key))} />
            ))}
          </ol>
        </SortableContext>
      </DndContext>
      {editable && (
        <div className="row-fields">
          <div className="field"><label htmlFor="new-step">{t('wizard.newStep')}</label>
            <input id="new-step" value={newName} onChange={(e) => setNewName(e.target.value)} /></div>
          <ActionButton permission="haccp.plan.edit" disabled={!newName.trim()} data-testid="step-add"
            onClick={() => { setItems([...items, { key: `new-${Date.now()}`, name: newName.trim() }]); setNewName(''); }}><Plus size={16} aria-hidden /> {t('wizard.addStep')}</ActionButton>
        </div>
      )}
      <fieldset className="row-fields">
        <legend>{t('plan.siteVerified')}</legend>
        <div className="field"><label htmlFor="site-date">{t('plan.siteVerifiedDate')}</label>
          <input id="site-date" type="date" disabled={!editable} value={date} onChange={(e) => setDate(e.target.value)} /></div>
        <div className="field"><label htmlFor="site-by">{t('plan.siteVerifiedBy')}</label>
          <input id="site-by" disabled={!editable} value={by} onChange={(e) => setBy(e.target.value)} /></div>
      </fieldset>
      {editable && <ActionButton permission="haccp.plan.edit" className="btn btn--primary" data-testid="flow-save"
        onClick={() => void save(`/api/plans/${data.plan.id}/steps`, 'PUT', { steps: items.map((i) => ({ id: i.id, name: i.id && i.name === i.orig ? undefined : i.name })), siteVerifiedDate: date || null, siteVerifiedBy: by }, t('wizard.saved'))}>
        <Save size={16} aria-hidden /> {t('wizard.save')}</ActionButton>}
    </div>
  );
}

function SortableStep({ item, index, editable, count, onName, onMove, onRemove }: {
  item: Item; index: number; editable: boolean; count: number; onName: (n: string) => void; onMove: (d: number) => void; onRemove: () => void;
}) {
  const { t } = useI18n();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.key, disabled: !editable });
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={`flow__step${isDragging ? ' dragging' : ''}`} data-testid={`step-${index}`}>
      {editable && <span className="flow__handle" {...attributes} {...listeners} aria-label={t('wizard.dragStep')} title={t('wizard.dragStep')}><GripVertical size={16} aria-hidden /></span>}
      <span className="flow__n code">{index + 1}</span>
      {editable
        ? <input aria-label={t('plan.col.step')} value={item.name} onChange={(e) => onName(e.target.value)} />
        : <span className="flow__name">{item.name}</span>}
      {editable && (
        <span className="flow__buttons">
          <ActionButton permission="haccp.plan.edit" className="icon-btn" disabled={index === 0} onClick={() => onMove(-1)} aria-label={t('wizard.moveUp')} title={t('wizard.moveUp')} data-testid={`step-up-${index}`}><ArrowUp size={16} aria-hidden /></ActionButton>
          <ActionButton permission="haccp.plan.edit" className="icon-btn" disabled={index === count - 1} onClick={() => onMove(1)} aria-label={t('wizard.moveDown')} title={t('wizard.moveDown')}><ArrowDown size={16} aria-hidden /></ActionButton>
          <ActionButton permission="haccp.plan.edit" className="icon-btn" onClick={onRemove} aria-label={t('wizard.remove')} title={t('wizard.remove')}><Trash2 size={16} aria-hidden /></ActionButton>
        </span>
      )}
    </li>
  );
}

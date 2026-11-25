/** إعدادات الوجبات: عدد الوجبات وأسماؤها وترتيب التتابع اليومي. */
import { useState } from 'react';
import { sortedMeals } from '@/domain/selectors';
import { useApp } from '@/state/AppContext';
import { Banner, Field, useToast } from '@/ui/components/ui';
import { SheetsSyncPanel } from './SheetsSyncPanel';

export function MealsSettings() {
  const { state, actions } = useApp();
  const toast = useToast();
  const meals = sortedMeals(state);
  const [name, setName] = useState('');
  const [label, setLabel] = useState('');

  const move = (index: number, offset: number) => {
    const target = index + offset;
    if (target < 0 || target >= meals.length) return;
    const ids = meals.map((meal) => meal.id);
    [ids[index], ids[target]] = [ids[target], ids[index]];
    void actions.reorderMeals(ids);
  };

  const handleAdd = async () => {
    if (!name.trim()) return toast('أدخل اسم الوجبة', 'error');
    await actions.addMeal(name, label || `الوجبة ${name}`);
    setName('');
    setLabel('');
    toast('تمت إضافة الوجبة في نهاية التتابع');
  };

  return (
    <div className="stack">
      <Banner kind="info">
        ترتيب الوجبات هنا هو ترتيب السجل اليومي: يبدأ التقرير الأول من الوجبة رقم 1 وينتهي بآخر وجبة.
        تغيير الترتيب يعيد حساب أرقام التتابع في كل الأيام تلقائياً.
      </Banner>

      <SheetsSyncPanel />

      <div className="card">
        <div className="card-head">
          <h2>الوجبات الحالية ({meals.length})</h2>
          <span className="badge"> الترتيب قابل للتعديل</span>
        </div>
        <div className="card-body stack">
          {meals.map((meal, index) => (
            <div className="meal-row" key={meal.id}>
              <span className="meal-order">{index + 1}</span>
              <div className="grow">
                <input
                  className="input"
                  aria-label={`اسم الوجبة ${index + 1}`}
                  defaultValue={meal.name}
                  onBlur={(event) => {
                    if (event.target.value.trim() && event.target.value !== meal.name) {
                      void actions.updateMeal(meal.id, { name: event.target.value });
                    }
                  }}
                />
              </div>
              <div className="grow">
                <input
                  className="input"
                  aria-label={`وصف الوجبة ${index + 1}`}
                  defaultValue={meal.label}
                  onBlur={(event) => {
                    if (event.target.value !== meal.label) {
                      void actions.updateMeal(meal.id, { label: event.target.value });
                    }
                  }}
                />
              </div>
              <div className="move-btns">
                <button onClick={() => move(index, -1)} disabled={index === 0} title="تقدم" aria-label="تقديم الوجبة">▲</button>
                <button onClick={() => move(index, 1)} disabled={index === meals.length - 1} title="تأخر" aria-label="تأخير الوجبة">▼</button>
              </div>
              <button
                className="btn btn-danger btn-sm"
                onClick={() => {
                  if (window.confirm(`حذف وجبة «${meal.name}»؟ سيبقى سجلها التاريخي محفوظاً.`)) {
                    void actions.removeMeal(meal.id);
                  }
                }}
              >حذف</button>
            </div>
          ))}
        </div>
      </div>

      <div className="card card-pad stack">
        <h3 style={{ margin: 0 }}>إضافة وجبة جديدة</h3>
        <div className="grid grid-2">
          <Field label="الاسم" hint="مثال: E أو Night">
            <input className="input" value={name} onChange={(event) => setName(event.target.value)} placeholder="E" />
          </Field>
          <Field label="الوصف" hint="مثال: الوجبة المسائية">
            <input className="input" value={label} onChange={(event) => setLabel(event.target.value)} placeholder="الوجبة المسائية" />
          </Field>
        </div>
        <div>
          <button className="btn btn-primary" onClick={handleAdd}>إضافة إلى التتابع</button>
        </div>
      </div>
    </div>
  );
}

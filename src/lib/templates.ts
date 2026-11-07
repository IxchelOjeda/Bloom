/** Built-in templates. Applying one creates real routines/tasks/budgets the user can then edit. */
export interface TemplateDef {
  id: string; kind: 'study' | 'morning' | 'night' | 'weekly_reset' | 'gym' | 'cleaning' | 'meal' | 'budget' | 'custom';
  name: string; blurb: string;
  routine?: { name: string; weekdays: number[]; start_time?: string; steps: [string, number][] };
  tasks?: string[];
  budgets?: [string, number][]; // category, fraction of monthly income
}

export const TEMPLATES: TemplateDef[] = [
  { id: 'morning', kind: 'morning', name: 'Gentle morning', blurb: '25 min, no rush',
    routine: { name: 'Morning routine', weekdays: [1, 2, 3, 4, 5], start_time: '07:30', steps: [['Glass of water', 2], ['Meds / vitamins', 2], ['Wash face & skincare', 6], ['Get dressed', 8], ['Look at today in the app', 5], ['Breakfast', 15]] } },
  { id: 'night', kind: 'night', name: 'Wind-down night', blurb: 'Screens off, mind off',
    routine: { name: 'Night routine', weekdays: [0, 1, 2, 3, 4, 5, 6], start_time: '21:30', steps: [['Quick tidy (5 things)', 5], ['Lay out tomorrow', 5], ['Skincare & teeth', 8], ['Brain dump', 5], ['Read or stretch', 15]] } },
  { id: 'study', kind: 'study', name: 'Study block', blurb: 'Two focused rounds with breaks',
    routine: { name: 'Study session', weekdays: [], steps: [['Clear desk, water, phone away', 3], ['Pick one topic', 2], ['Focus round', 25], ['Break', 5], ['Focus round', 25], ['Write 3 things you learned', 5]] } },
  { id: 'weekly_reset', kind: 'weekly_reset', name: 'Sunday reset', blurb: 'Ready for the week',
    routine: { name: 'Sunday reset', weekdays: [0], start_time: '17:00', steps: [['Weekly review in the app', 10], ['Plan meals & grocery list', 15], ['Laundry', 20], ['Reset kitchen', 15], ['Check bills due', 5], ['Pick top 3 priorities', 5]] } },
  { id: 'gym', kind: 'gym', name: 'Full-body gym', blurb: 'Simple 3×/week',
    routine: { name: 'Gym routine', weekdays: [1, 3, 5], steps: [['Warm-up', 10], ['Squats', 10], ['Push (bench / push-ups)', 10], ['Pull (rows / lat pulldown)', 10], ['Core', 8], ['Stretch', 7]] } },
  { id: 'cleaning', kind: 'cleaning', name: 'Cleaning rotation', blurb: 'One zone a day',
    tasks: ['Mon: kitchen surfaces', 'Tue: bathroom', 'Wed: floors', 'Thu: laundry', 'Fri: fridge check', 'Sat: bedroom & sheets'] },
  { id: 'meal', kind: 'meal', name: 'Meal prep basics', blurb: 'Prep once, eat thrice',
    tasks: ['Pick 3 meals for the week', 'Write grocery list', 'Shop', 'Cook a grain + a protein', 'Chop veggies'] },
  { id: 'budget', kind: 'budget', name: '50/30/20 budget', blurb: 'Needs, wants, savings',
    budgets: [['Housing', 0.3], ['Bills', 0.1], ['Food', 0.1], ['Shopping', 0.1], ['Entertainment', 0.1], ['Personal care', 0.05], ['Transportation', 0.05]] },
];

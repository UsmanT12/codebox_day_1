# Trace demo script

Target: about 80 seconds, including short pauses and switching to the app.
Speak the quoted paragraphs only. The bracketed lines are actions, not narration.

## 0–20 seconds: slide 1, tech stack

“I built Trace with plain HTML, CSS, and JavaScript on the frontend, and Node.js
with Express on the backend. Supabase provides PostgreSQL storage and user
accounts. Food information comes from the USDA FoodData Central API.”

## 20–35 seconds: slide 2, project purpose

“Trace is a nutrition diary focused on micronutrients, like iron, calcium, and
vitamin D. It also tracks calories and macros. The goal is to make gaps in your
recorded intake easier to notice.”

## 35–60 seconds: live app, daily view

[Switch to the app, already signed in. Have an egg search result ready.]

“Here I choose a food and enter the quantity. Adding it updates the daily totals.
The bars show how each nutrient compares with a fixed target, and the gaps
section highlights the lowest ones. I can also remove a food or look at a
previous day.”

[Add the prepared food and point to the nutrient bars.]

## 60–80 seconds: live app, weekly view and close

[Click Weekly.]

“The weekly view averages the last seven days so I can see patterns over time.
Each account has a private diary, and saved entries keep their original
nutrition values. This MVP makes daily food logging easier to understand.”

## Before presenting

- Open `trace-demo.html` in a browser. Use the arrow keys to change slides and
  press F for full screen.
- Keep the running app in another tab. Sign in before starting the timer.
- Finish `db/accounts.sql` in Supabase and confirm USDA search works. These
  were still setup items when account support was added.
- Have a food result and a day with a few real logged foods ready. Avoid spending
  demo time waiting for email confirmation or typing searches.
- Rehearse once with a timer. If needed, omit the sentence about deleting foods
  and viewing previous days.
- If the live app is not ready, keep slide 2 visible and describe the intended
  flow without pretending to perform the actions.

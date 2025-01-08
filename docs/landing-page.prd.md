# Landing page

See db/schema.prisma for the overall structure of our app.

Our landing page (src/app/(main)/[locale]/(cities)/page.tsx) should have the following elements:

1. A hero section with a messsage like "Κάνουμε την αυτοδιοίκηση _λιανά_", and a submessage "To ΟpenCouncil χρησιμοποιεί
   τεχνητή νοημοσύνη για να παρακολουθεί τα δημοτικά συμβούλια και να τα φέρει στους δημότες". Α nice prominent CTA button should
   take you to /explain (we'll build this later), with the text "Μάθε περισσότερα". Below, a smaller link "για δήμους" should take you to
   /about (this already exists). The hero should generally have a cool vibe -- the world λιανά should be highlighted.
2. Then, we'll list all cities that the user has access to (superadmins and some admins can see non-public cities,
   all other users can only see public cities). If a city is not public and the user can see it (because they're an admin),
   we should say it in small font (αυτή η πόλη δεν είναι δημόσια ορατή).
3. Each city will be a full row, that includes the city logo and the city name on the first line. The next line 
   will be split into three cards: one wide card (maybe 50% of the screen) as a link to the most recent meeting,
   and two smaller equally sized cards linking to people and parties (see src/components/cities/City.tsx)
   Then, we'll have a bunch of subject cards (3 from the most recent meeting, 2 from the next one and
   1 from the one before the previous one, something like that). Look at our existing logic for picking most
   important subjects from a meeting at [src/lib/utils.ts]. All this is a descriuptiuon
   for a medium or large screen -- its should adapt nicely to smaller screens.


Everything should be mobile friendly, adaptive and look nice and use shadcn components.
Look at our about page for a nicely styled page (src/components/static/About.tsx).
You can also use framer if needed for animations.

Technically, you should split this work into two parts:
1. The page.tsx should server-side fetch all PUBLIC necessary data to be displayed: src/app/(main)/[locale]/(cities)/page.tsx
   It's important to only get public data, so that the page can be static (we want to create it at build time and cache it)
2. It should then pass the data to a LandingPage component: src/components/landing.tsx
   This component should be "use client" and check if the user is signed in. If we are, we should fetch all cities we can access.
   
Note that all database-reading should happen under src/lib/db (eg see src/lib/db/cities.ts)

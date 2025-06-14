# spinorama-experiments

This is a work-in-progress study of client side rendering of the entire Spinorama.

The purpose is to produce TypeScript routines that can read raw measurement data in various formats
and display them. For this purpose, various CEA2034 related analysis functions have also been
ported to TypeScript.

Goals:

- All measurement types must be readable, including those that do not have a full spin data
- Some measurements are incomplete, e.g. missing spin angles, likely due to human error.
  Approaches for tolerating missing data should be considered.

Practical steps:

1. Develop required loaders. Most notable missing types: webplot digitizer (various graphs provided for display), rew text dump (similar)

2. Develop every other missing function like tables, statistics, comparison charts, etc. etc. etc.

3. Consider how to really deal with missing data. Currently I'm forcing all measurements to become complete by duplicating and copying measurement traces, but marking all measurements as "busted" which have this sort of fixing performed.


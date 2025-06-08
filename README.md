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

1. Develop required loaders. Most notable missing types: princeton (impulse response in matlab v4 files), webplot digitizer (various graphs provided for display), rew text dump (similar)

2. Make offline analysis step that uses all the loaders and the developed analysis functions offline
   and creates metadata document that replicates the build result from spinorama presently.

3. Add supplementary data for various speakers e.g. Price per unit, Vendor, Model, etc. are needed to maintain usefulness.
   An issue with pricing data is that it is subject to inflation, customs fees, etc. It might be necessary to adjust these figures over time.

4. Develop every other missing function like tables, statistics, comparison charts, etc. etc. etc.


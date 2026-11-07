# Trademarks

`@cosyte/astm` is an independent open-source project. Cosyte is **not affiliated with, endorsed by,
or sponsored by** any company or organization named in this repository or its documentation.

## Why these names appear

A laboratory interface is built against published standards and talks to analyzers whose makers
each read those standards a little differently. Saying which standard this package reads, which
code system it maps to, or which analyzer behavior a fixture or a limitation describes cannot be
done without naming them.

Every reference is **descriptive**: it identifies a standard, a code system, or a product whose
behavior is discussed, and nothing more. Naming a system is the only way to say whether a library
works with it.

## Names referenced

| Name                                         | Where it appears                                                                                                            |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| ASTM, ASTM E1381, ASTM E1394                 | The standard designations this package reads and writes, from ASTM International.                                           |
| CLSI, LIS01-A2, LIS02-A2                     | The successor designations of those standards, from the Clinical and Laboratory Standards Institute.                        |
| LOINC                                        | The code system a LIVD catalog maps to, from the Regenstrief Institute. No LOINC content ships in this package.             |
| SNOMED CT                                    | Named as a code system you may bring. No SNOMED CT content ships in this package.                                           |
| LIVD, IICC                                   | The LIVD format for mapping vendor test codes to LOINC, from the IVD Industry Connectivity Consortium.                      |
| cobas, Iguana, Sysmex, ADVIA, Mindray, Snibe | Named in the README and the documentation only, to describe framing behavior and analyzer families. None is an export name. |

All product names, logos, and brands are the property of their respective owners. Use of a name here
does not imply any affiliation with, or endorsement by, its owner. If you own one of these marks and
would like a reference changed, please open an issue.

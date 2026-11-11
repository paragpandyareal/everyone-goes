# Statistics checked against their source (PRD 18)

Checked Wednesday 11 Nov 2026 by Claude Code. Each line quotes the source's own words. A number not on this list must not appear in the video or Devpost text.

| # | Claim as we may use it | Source opened | Exact wording found | Status |
|---|---|---|---|---|
| 1 | 93% of teachers have students whose families can't afford all necessary supplies (credited on the page to the 2026 Teacher Impact Survey, rechecked 12 Nov 2026). Teachers spent an average of $895 of their own money on school supplies in 2024–25 (2025 Teacher Spending Survey). Also on the page: up 49% from $600 in 2015; median school supply budget $200; 97% say it is not enough; 3,700 K-12 teachers, Spring 2025 | adoptaclassroom.org/2025/06/09/2025-teacher-survey-spending-stats-classroom-needs/ | "More than 93% of teachers stated they have students whose families cannot afford all the necessary school supplies". "$895 is the average amount teachers spent out-of-pocket on school supplies during the 2024–2025 school year." | **Verified.** Say "more than 93%" |
| 2 | US families spent an average of $1,016 on a child's main sport in 2024, up 46% since 2019 | projectplay.org/news/2025/2/24/project-play-survey-family-spending-on-youth-sports-rises-46-over-five-years | "The average U.S. sports family spent $1,016 on their child's primary sport in 2024, a 46% increase since 2019" | **Verified** |
| 3 | California Education Code 35330(b): no pupil kept off a field trip for lack of funds; the board coordinates community groups to fund pupils in need | california.public.law/codes/ca_educ_code_section_35330 (secondary copy; the official leginfo site and Justia returned 403 to the fetch tool) | "A pupil shall not be prevented from making the field trip or excursion because of lack of sufficient funds. To this end, the governing board shall coordinate efforts of community service groups to supply funds for pupils in need." | **Verified from a secondary copy.** The official leginfo.legislature.ca.gov page blocks automated access; the text was taken from the public.law copy |
| 4 | School lunch payment platforms charge on average $2.37 or 4.4% per transaction, which can cost families upwards of $100M a year; CFPB studied the 300 largest districts | consumerfinance.gov/about-us/newsroom/cfpb-report-highlights-junk-fees-charged-by-school-lunch-payment-platforms/ | "transaction fees of $2.37, or 4.4%, of the total transaction, on average"; "collectively can cost families upwards of $100 million each year"; "the 300 largest public school districts"; "the vast majority of enrolled students are served by just three market leaders" | **Verified.** About lunch accounts only, never trips. Do not say "67%" (not found on this page); say "three market leaders" |
| 5 | PayPal has 440 million active accounts, up 0.6% | sec.gov/Archives/edgar/data/0001633917/000163391726000086/pypl3q-26earningsrelease.htm | "Active accounts increased 0.6% to 440 million." | **Verified** |
| 5b | FY2026 transaction margin dollars guidance about $15.7B | SEC release says only "raising full year non-GAAP TM$ … guidance" and points to the presentation. $15.7B appears in earnings coverage (marketbeat, fxcintel) | — | **Not verified from a primary page. Do not use** |
| 6 | US invoice fees, paid by the organiser: 3.49% + $0.49 when paid with PayPal or Venmo, 2.99% + $0.49 by card, 4.99% + $0.49 with Pay Later | paypalobjects.com/marketing/ua/pdf/US/us-merchant-fees-04-november-2026.pdf (PayPal US merchant fee schedule, 4 Nov 2026) | "PayPal Checkout, Pay with Venmo, or PayPal Guest Checkout 3,49 % + fixed fee"; "Standard Credit and Debit Card Payments … 2,99 % + fixed fee"; "PayPal Pay Later options 4,99 % + fixed fee"; fixed fee "US dollar 0.49 USD" | **Verified.** The scenario table uses 3.49% + $0.49 (the PayPal and Venmo rate) |
| 7 | US invoices can be paid with PayPal, Venmo, Pay Later or card | Same fee schedule lists all four as "Payment Type through an Invoicing Transaction" | See row 6 | **Verified that they exist.** Do not claim Venmo works in the demo unless shown |
| 8 | Confirmed charities pay 1.99% + fixed fee | Same fee schedule, "Charity Transaction Rates" | "Charity Transactions 1,99 % + fixed fee", subject to "eligibility, application, and pre-approval by PayPal" | **Verified** |
| 9 | About 3.8M US K-12 teachers | Not opened | — | **Not verified.** Used only as a stated scenario assumption; say "an assumption" |
| 10 | No public hackathon repo in our survey has a private hardship path with sponsor captures | `docs/research/census.md` (own research, 3,373 repos) | — | Own research. Say "in our survey of public repos" |

## Scenario table (a scenario, not a forecast)

Assumes 6 collections a year per organiser, 25 families each, $60 average, every invoice paid with PayPal at 3.49% + $0.49.
Fee per invoice = 60 × 3.49% + 0.49 = $2.584. Per organiser per year = 150 invoices × $2.584 = $387.60.

| Line | Low | Base | High |
|---|---|---|---|
| Organisers | 10,000 | 50,000 | 200,000 |
| Invoice fee revenue | $3.9M | $19.4M | $77.5M |
| Parent accounts newly active (5% / 10% / 15% of families reached) | 12.5k | 125k | 750k |
| Local businesses with a saved PayPal pledge (1 per organiser) | 10k | 50k | 200k |

Card payments (2.99%) or a charity rate (1.99%) lower the revenue line. That is a pricing choice for PayPal. Families reached = organisers × 25 (the same families across one organiser's six collections).

# Driver queue regression

The reported empty queue exposed missing visible validation and form replacement during quantity/reason/signature edits. A change event could replace the pending Record click target. Required arrival and evidence markers were enforced through an easy-to-miss message.

Fourteen event-adapter tests were written against the original inline script. RED: 4 passed, 10 failed. After the fix: GREEN 14/14. The actual original outputs are retained here, with local paths sanitised. Tests use a small VM document stub and expressly do not assert browser, native-device or server acceptance.

The corrected form retains its controls during editing, shows associated persistent validation, rejects blank quantities and focuses the event queue after recording. Local browser checks confirm missing evidence is explained and recording immediately after a quantity edit produces a queued event. Offline recording and acknowledgement remain distinct.

Scope and representative workflow reviews remain pending. This correction does not complete M01-T03 or M06.

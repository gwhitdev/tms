using Tms.Contracts;

// Dependency-free executable specification harness, not a test-framework substitute
// for future PostgreSQL, API, security, real-device or operational acceptance tests.
var scenarios = new List<(string Id, string Name, Action Run)>();
var tenant = Guid.Parse("11111111-1111-1111-1111-111111111111");
var otherTenant = Guid.Parse("22222222-2222-2222-2222-222222222222");
TenantReference Ref(int number) => new(tenant, Guid.Parse($"00000000-0000-0000-0000-{number:000000000000}"));
var start = new DateTimeOffset(2026, 10, 2, 8, 0, 0, TimeSpan.Zero);
Reservation ReservationFor(int task, int resource, int startHour, int endHour) => new(
    Guid.NewGuid(), Ref(task), [new ResourceReference(Ref(resource), ResourceKind.Vehicle)],
    new TimeRange(start.AddHours(startHour), start.AddHours(endHour)));
DeliveryAttempt Attempt(int number, int quantity, string? reason = null, string? evidence = "pod-1") => new(
    Guid.Parse($"10000000-0000-0000-0000-{number:000000000000}"), quantity, evidence, reason);

scenarios.Add(("DDD-TENANT-01", "tenant-qualified references reject mismatched ownership", () => {
    Ref(1).EnsureTenant(tenant);
    Throws<DomainRuleException>(() => Ref(1).EnsureTenant(otherTenant));
    Throws<DomainRuleException>(() => new TenantReference(Guid.Empty, Guid.NewGuid()));
}));
scenarios.Add(("DDD-STATE-01", "booking lifecycle progresses through explicit transitions", () => {
    var state = OperationalState.Draft;
    foreach (var next in new[] { OperationalState.Validated, OperationalState.ReadyForPlanning,
        OperationalState.Assigned, OperationalState.Dispatched, OperationalState.InProgress, OperationalState.Completed })
        state = Lifecycle.Transition(state, next);
    Equal(OperationalState.Completed, state);
}));
scenarios.Add(("DDD-STATE-02", "terminal states and unapproved dispatched cancellation are rejected", () => {
    Throws<DomainRuleException>(() => Lifecycle.Transition(OperationalState.Completed, OperationalState.InProgress));
    Throws<DomainRuleException>(() => Lifecycle.Transition(OperationalState.Draft, OperationalState.Completed));
    Throws<DomainRuleException>(() => Lifecycle.Transition(OperationalState.Dispatched, OperationalState.Cancelled));
    Equal(OperationalState.Cancelled, Lifecycle.Transition(OperationalState.Dispatched, OperationalState.Cancelled, true));
}));
scenarios.Add(("DDD-RESERVATION-01", "overlapping exclusive resource commitments are rejected", () => {
    var first = ReservationRules.Reserve(new ReservationSnapshot(tenant, 0, []), ReservationFor(1, 90, 0, 2), 0);
    Throws<DomainRuleException>(() => ReservationRules.Reserve(first, ReservationFor(2, 90, 1, 3), 1));
    Throws<DomainRuleException>(() => ReservationRules.Reserve(first, ReservationFor(1, 91, 3, 4), 1));
}));
scenarios.Add(("DDD-RESERVATION-02", "half-open adjacent intervals and independent resources are allowed", () => {
    var first = ReservationRules.Reserve(new ReservationSnapshot(tenant, 0, []), ReservationFor(1, 90, 0, 2), 0);
    var second = ReservationRules.Reserve(first, ReservationFor(2, 90, 2, 4), 1);
    var third = ReservationRules.Reserve(second, ReservationFor(3, 91, 0, 2), 2);
    Equal(3, third.Reservations.Count);
    Equal(3L, third.Version);
}));
scenarios.Add(("DDD-RESERVATION-03", "two in-memory CAS contenders at one version have one winner", () => {
    var book = new InMemoryReservationBook(tenant);
    var outcomes = new bool[2];
    Parallel.Invoke(
        () => outcomes[0] = book.TryReserve(ReservationFor(1, 90, 0, 2), 0),
        () => outcomes[1] = book.TryReserve(ReservationFor(2, 90, 0, 2), 0));
    Equal(1, outcomes.Count(result => result));
    Equal(1L, book.Read().Version);
    Throws<DomainRuleException>(() => ReservationRules.Reserve(book.Read(), ReservationFor(3, 91, 3, 4), 0));
}));
scenarios.Add(("DDD-RESERVATION-04", "cross-tenant resources and invalid time ranges cannot be reserved", () => {
    var request = new Reservation(Guid.NewGuid(), Ref(1),
        [new ResourceReference(new TenantReference(otherTenant, Guid.NewGuid()), ResourceKind.Vehicle)],
        new TimeRange(start, start.AddHours(1)));
    Throws<DomainRuleException>(() => ReservationRules.Reserve(new ReservationSnapshot(tenant, 0, []), request, 0));
    Throws<DomainRuleException>(() => new TimeRange(start, start));
}));
scenarios.Add(("DDD-DELIVERY-01", "partial deliveries preserve history and exact follow-up quantity", () => {
    var original = new DeliveryProgress(Ref(7), 10);
    var partial = original.Record(Attempt(1, 4, "Six units require a new delivery attempt"));
    Equal(6, partial.OutstandingQuantity);
    Equal(DeliveryResult.Partial, partial.Result);
    Equal(10, original.OutstandingQuantity);
    var complete = partial.Record(Attempt(2, 6));
    Equal(0, complete.OutstandingQuantity);
    Equal(DeliveryResult.Complete, complete.Result);
    Equal(2, complete.Attempts.Count);
}));
scenarios.Add(("DDD-DELIVERY-02", "over-delivery, negative quantities and missing POD are rejected", () => {
    var progress = new DeliveryProgress(Ref(7), 10);
    Throws<DomainRuleException>(() => progress.Record(Attempt(1, 11)));
    Throws<DomainRuleException>(() => progress.Record(Attempt(1, -1)));
    Throws<DomainRuleException>(() => progress.Record(Attempt(1, 10, evidence: null)));
    Throws<DomainRuleException>(() => new DeliveryProgress(Ref(7), 0));
}));
scenarios.Add(("DDD-DELIVERY-03", "retrying the identical delivery attempt is idempotent", () => {
    var attempt = Attempt(1, 4, "Remaining work stays open");
    var recorded = new DeliveryProgress(Ref(7), 10).Record(attempt);
    True(ReferenceEquals(recorded, recorded.Record(attempt)));
    Equal(4, recorded.DeliveredQuantity);
}));
scenarios.Add(("DDD-DELIVERY-04", "changed attempt IDs cannot rewrite evidence or quantities", () => {
    var recorded = new DeliveryProgress(Ref(7), 10).Record(Attempt(1, 4, "Remaining work stays open"));
    Throws<DomainRuleException>(() => recorded.Record(Attempt(1, 5, "Changed quantity")));
    Equal(4, recorded.DeliveredQuantity);
}));
scenarios.Add(("DDD-DELIVERY-05", "failed attempts preserve cargo outstanding and require a reason", () => {
    var progress = new DeliveryProgress(Ref(7), 10);
    var failed = progress.Record(Attempt(1, 0, "Recipient unavailable", null));
    Equal(10, failed.OutstandingQuantity);
    Equal(DeliveryResult.NotDelivered, failed.Result);
    Throws<DomainRuleException>(() => progress.Record(Attempt(1, 0, evidence: null)));
}));
scenarios.Add(("DDD-PRICE-01", "an agreed GBP rate remains reproducible after tariff changes", () => {
    var agreed = new AgreedPriceSnapshot(Guid.NewGuid(), "rate-v1", 2m, new Money(10m, "GBP"));
    var revisedTariff = new Money(99m, "GBP");
    Equal(20m, PriceRules.Total(agreed, []).Amount);
    Equal(99m, revisedTariff.Amount);
    Equal("rate-v1", agreed.RateVersion);
    Throws<DomainRuleException>(() => new Money(-1m, "GBP"));
}));
scenarios.Add(("DDD-PRICE-02", "extras require approval and matching currency", () => {
    var agreed = new AgreedPriceSnapshot(Guid.NewGuid(), "rate-v1", 2m, new Money(10m, "GBP"));
    Equal(25m, PriceRules.Total(agreed, [new ExtraCharge(new Money(5m, "GBP"), true, "approval-1")]).Amount);
    Throws<DomainRuleException>(() => PriceRules.Total(agreed, [new ExtraCharge(new Money(5m, "GBP"), false, null)]));
    Throws<DomainRuleException>(() => PriceRules.Total(agreed, [new ExtraCharge(new Money(5m, "EUR"), true, "approval-1")]));
}));
scenarios.Add(("DDD-EVENT-01", "integration envelopes carry valid scope and positive aggregate sequence", () => {
    var envelope = new IntegrationEnvelope(Guid.NewGuid(), tenant, Ref(7), "execution.delivery_recorded", 1, 1, start, Guid.NewGuid());
    IntegrationContract.Validate(envelope);
    Throws<DomainRuleException>(() => IntegrationContract.Validate(envelope with { TenantId = otherTenant }));
    Throws<DomainRuleException>(() => IntegrationContract.Validate(envelope with { AggregateSequence = 0 }));
    Throws<DomainRuleException>(() => IntegrationContract.Validate(envelope with { SchemaVersion = 2 }));
}));
scenarios.Add(("DDD-EVENT-02", "ERP statuses map to reported milestones and unknown values fail closed", () => {
    Equal(InboundMilestone.DeliveryReported, ExternalStatusMapper.Map("DELIVERED"));
    Throws<DomainRuleException>(() => ExternalStatusMapper.Map("MAGIC_COMPLETE"));
}));
scenarios.Add(("PLAN-LOAD-01", "capacity is checked at every stop, including a transient overload", () => {
    LoadProfile.EnsureFeasible(10m, 0m, [6m, -4m, 7m, -9m]);
    Throws<DomainRuleException>(() => LoadProfile.EnsureFeasible(10m, 5m, [6m, -6m]));
    Throws<DomainRuleException>(() => LoadProfile.EnsureFeasible(10m, 0m, [-1m]));
}));

var passed = 0;
foreach (var scenario in scenarios) {
    try { scenario.Run(); passed++; Console.WriteLine($"PASS {scenario.Id} | {scenario.Name}"); }
    catch (Exception error) { Console.WriteLine($"FAIL {scenario.Id} | {error.GetType().Name}: {error.Message}"); }
}
Console.WriteLine($"RESULT passed={passed} failed={scenarios.Count - passed} total={scenarios.Count}");
Console.WriteLine("LIMITATION: in-memory contract examples; no PostgreSQL, tenant security, real-device, routing-provider or production acceptance assurance.");
return passed == scenarios.Count ? 0 : 1;

static void Equal<T>(T expected, T actual) {
    if (!EqualityComparer<T>.Default.Equals(expected, actual)) throw new Exception($"Expected {expected}; got {actual}");
}
static void True(bool value) { if (!value) throw new Exception("Expected true"); }
static void Throws<T>(Action action) where T : Exception {
    try { action(); } catch (T) { return; }
    throw new Exception($"Expected {typeof(T).Name}");
}

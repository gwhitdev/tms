namespace Tms.Contracts;

// Executable M01 design examples. Persistence, authorisation and provider adapters
// are deliberately outside these rules and require later acceptance evidence.
public sealed class DomainRuleException(string message) : InvalidOperationException(message);
public readonly record struct TenantReference {
    public Guid TenantId { get; }
    public Guid Id { get; }
    public TenantReference(Guid tenantId, Guid id) {
        if (tenantId == Guid.Empty || id == Guid.Empty) throw new DomainRuleException("Tenant and entity IDs must be non-empty.");
        TenantId = tenantId;
        Id = id;
    }
    public void EnsureTenant(Guid expected) {
        if (expected == Guid.Empty || TenantId != expected || Id == Guid.Empty)
            throw new DomainRuleException("Reference does not belong to the expected tenant.");
    }
}
public enum OperationalState { Draft, Validated, ReadyForPlanning, Assigned, Dispatched, InProgress, Completed, PartiallyCompleted, Failed, Cancelled }
public static class Lifecycle {
    public static OperationalState Transition(OperationalState current, OperationalState next, bool cancellationApproved = false) {
        var allowed = (current, next) switch {
            (OperationalState.Draft, OperationalState.Validated or OperationalState.Cancelled) => true,
            (OperationalState.Validated, OperationalState.ReadyForPlanning or OperationalState.Cancelled) => true,
            (OperationalState.ReadyForPlanning, OperationalState.Assigned or OperationalState.Cancelled) => true,
            (OperationalState.Assigned, OperationalState.Dispatched or OperationalState.ReadyForPlanning or OperationalState.Cancelled) => true,
            (OperationalState.Dispatched, OperationalState.InProgress) => true,
            (OperationalState.InProgress, OperationalState.Completed or OperationalState.PartiallyCompleted or OperationalState.Failed) => true,
            (OperationalState.Dispatched or OperationalState.InProgress, OperationalState.Cancelled) => cancellationApproved,
            _ => false
        };
        if (!allowed) throw new DomainRuleException($"Transition {current} to {next} requires a valid business command.");
        return next;
    }
}
public enum ResourceKind { Driver, Vehicle, Trailer }
public sealed record ResourceReference(TenantReference Reference, ResourceKind Kind);
public sealed record TimeRange {
    public DateTimeOffset Start { get; }
    public DateTimeOffset End { get; }
    public TimeRange(DateTimeOffset start, DateTimeOffset end) {
        if (end <= start) throw new DomainRuleException("A reservation interval must have positive duration.");
        Start = start.ToUniversalTime();
        End = end.ToUniversalTime();
    }
    public bool Overlaps(TimeRange other) => Start < other.End && other.Start < End;
}
public sealed record Reservation {
    public Guid Id { get; }
    public TenantReference Task { get; }
    public IReadOnlyList<ResourceReference> Resources { get; }
    public TimeRange Window { get; }
    public Reservation(Guid id, TenantReference task, IReadOnlyList<ResourceReference> resources, TimeRange window) {
        if (id == Guid.Empty || resources.Count == 0) throw new DomainRuleException("Reservation ID and resources are required.");
        Id = id;
        Task = task;
        Resources = Array.AsReadOnly(resources.ToArray());
        Window = window;
    }
}
public sealed record ReservationSnapshot {
    public Guid TenantId { get; }
    public long Version { get; }
    public IReadOnlyList<Reservation> Reservations { get; }
    public ReservationSnapshot(Guid tenantId, long version, IReadOnlyList<Reservation> reservations) {
        if (tenantId == Guid.Empty || version < 0) throw new DomainRuleException("Reservation scope and version are invalid.");
        TenantId = tenantId;
        Version = version;
        Reservations = Array.AsReadOnly(reservations.ToArray());
    }
}
public static class ReservationRules {
    public static ReservationSnapshot Reserve(ReservationSnapshot current, Reservation proposal, long expectedVersion) {
        if (current.Version != expectedVersion || current.Version == long.MaxValue)
            throw new DomainRuleException("Reservation version changed; refresh before committing.");
        proposal.Task.EnsureTenant(current.TenantId);
        foreach (var resource in proposal.Resources) {
            resource.Reference.EnsureTenant(current.TenantId);
            if (!Enum.IsDefined(resource.Kind)) throw new DomainRuleException("Unknown resource kind.");
        }
        if (proposal.Resources.Distinct().Count() != proposal.Resources.Count)
            throw new DomainRuleException("A reservation cannot repeat a resource.");
        foreach (var existing in current.Reservations) {
            existing.Task.EnsureTenant(current.TenantId);
            if (existing.Id == proposal.Id || existing.Task == proposal.Task)
                throw new DomainRuleException("A task already has a commitment; amend it explicitly.");
            if (existing.Window.Overlaps(proposal.Window) && existing.Resources.Intersect(proposal.Resources).Any())
                throw new DomainRuleException("An exclusive resource is already reserved during this interval.");
        }
        return new ReservationSnapshot(current.TenantId, current.Version + 1, current.Reservations.Append(proposal).ToArray());
    }
}
// Sample adapter to demonstrate compare-and-swap under two contenders. Production
// must enforce exclusive resource commitments transactionally in PostgreSQL.
public sealed class InMemoryReservationBook {
    private readonly object gate = new();
    private ReservationSnapshot current;
    public InMemoryReservationBook(Guid tenant) => current = new(tenant, 0, []);
    public bool TryReserve(Reservation proposal, long expectedVersion) {
        lock (gate) {
            try { current = ReservationRules.Reserve(current, proposal, expectedVersion); return true; }
            catch (DomainRuleException) { return false; }
        }
    }
    public ReservationSnapshot Read() { lock (gate) return current; }
}
public enum DeliveryResult { NotDelivered, Partial, Complete }
public sealed record DeliveryAttempt(Guid Id, int DeliveredQuantity, string? EvidenceReference, string? ExceptionReason);
public sealed class DeliveryProgress {
    public TenantReference Consignment { get; }
    public int BookedQuantity { get; }
    public int OutstandingQuantity => BookedQuantity - DeliveredQuantity;
    public int DeliveredQuantity { get; }
    public DeliveryResult Result => DeliveredQuantity == 0 ? DeliveryResult.NotDelivered : OutstandingQuantity == 0 ? DeliveryResult.Complete : DeliveryResult.Partial;
    public IReadOnlyList<DeliveryAttempt> Attempts { get; }
    public DeliveryProgress(TenantReference consignment, int bookedQuantity) : this(consignment, bookedQuantity, []) { }
    private DeliveryProgress(TenantReference consignment, int bookedQuantity, IReadOnlyList<DeliveryAttempt> attempts) {
        consignment.EnsureTenant(consignment.TenantId);
        if (bookedQuantity <= 0) throw new DomainRuleException("Booked quantity must be positive.");
        Consignment = consignment;
        BookedQuantity = bookedQuantity;
        Attempts = Array.AsReadOnly(attempts.ToArray());
        DeliveredQuantity = attempts.Sum(attempt => attempt.DeliveredQuantity);
    }
    public DeliveryProgress Record(DeliveryAttempt attempt) {
        var existing = Attempts.FirstOrDefault(item => item.Id == attempt.Id);
        if (existing is not null) {
            if (existing == attempt) return this;
            throw new DomainRuleException("A recorded attempt ID cannot change its evidence or quantities.");
        }
        if (attempt.Id == Guid.Empty || attempt.DeliveredQuantity < 0 || attempt.DeliveredQuantity > OutstandingQuantity)
            throw new DomainRuleException("Delivery quantity or attempt ID is invalid.");
        if (OutstandingQuantity == 0) throw new DomainRuleException("Completed deliveries require a separate correction command.");
        if (attempt.DeliveredQuantity > 0 && string.IsNullOrWhiteSpace(attempt.EvidenceReference))
            throw new DomainRuleException("Delivered goods require proof-of-delivery evidence.");
        if (attempt.DeliveredQuantity < OutstandingQuantity && string.IsNullOrWhiteSpace(attempt.ExceptionReason))
            throw new DomainRuleException("An incomplete attempt requires an exception reason.");
        return new DeliveryProgress(Consignment, BookedQuantity, Attempts.Append(attempt).ToArray());
    }
}
public readonly record struct Money {
    public decimal Amount { get; }
    public string Currency { get; }
    public Money(decimal amount, string currency) {
        if (amount < 0 || string.IsNullOrWhiteSpace(currency) || currency.Length != 3 || currency.Any(character => character < 'A' || character > 'Z'))
            throw new DomainRuleException("Money requires a nonnegative amount and three uppercase currency letters.");
        Amount = amount;
        Currency = currency;
    }
}
public sealed record AgreedPriceSnapshot(Guid AgreementId, string RateVersion, decimal Quantity, Money UnitPrice);
public sealed record ExtraCharge(Money Amount, bool Approved, string? ApprovalReference);
public static class PriceRules {
    public static Money Total(AgreedPriceSnapshot snapshot, IReadOnlyList<ExtraCharge> extras) {
        if (snapshot.AgreementId == Guid.Empty || string.IsNullOrWhiteSpace(snapshot.RateVersion) || snapshot.Quantity <= 0 || snapshot.UnitPrice.Currency != "GBP")
            throw new DomainRuleException("This illustrative price policy requires a valid agreed GBP rate snapshot.");
        var total = snapshot.Quantity * snapshot.UnitPrice.Amount;
        foreach (var charge in extras) {
            if (!charge.Approved || string.IsNullOrWhiteSpace(charge.ApprovalReference) || charge.Amount.Currency != snapshot.UnitPrice.Currency)
                throw new DomainRuleException("An extra charge requires recorded approval and matching currency.");
            total += charge.Amount.Amount;
        }
        // Chosen example rounding; real commercial/tax policy still needs review.
        return new Money(decimal.Round(total, 2, MidpointRounding.AwayFromZero), snapshot.UnitPrice.Currency);
    }
}
public sealed record IntegrationEnvelope(Guid EventId, Guid TenantId, TenantReference Aggregate, string EventType, int SchemaVersion, long AggregateSequence, DateTimeOffset OccurredAtUtc, Guid CorrelationId);
public static class IntegrationContract {
    public static void Validate(IntegrationEnvelope envelope) {
        envelope.Aggregate.EnsureTenant(envelope.TenantId);
        if (envelope.EventId == Guid.Empty || envelope.CorrelationId == Guid.Empty || envelope.AggregateSequence <= 0 ||
            envelope.SchemaVersion != 1 || envelope.OccurredAtUtc.Offset != TimeSpan.Zero || string.IsNullOrWhiteSpace(envelope.EventType))
            throw new DomainRuleException("Integration envelope metadata is invalid or uses an unsupported version.");
    }
}
public enum InboundMilestone { CollectionReported, InTransitReported, DeliveryReported, PartialDeliveryReported }
public static class ExternalStatusMapper {
    public static InboundMilestone Map(string externalStatus) => externalStatus switch {
        "COLLECTED" => InboundMilestone.CollectionReported,
        "IN_TRANSIT" => InboundMilestone.InTransitReported,
        "DELIVERED" => InboundMilestone.DeliveryReported,
        "PARTIALLY_DELIVERED" => InboundMilestone.PartialDeliveryReported,
        _ => throw new DomainRuleException("Unrecognised ERP status requires reconciliation.")
    };
}
public static class LoadProfile {
    public static void EnsureFeasible(decimal capacity, decimal initialLoad, IReadOnlyList<decimal> changes) {
        if (capacity <= 0 || initialLoad < 0 || initialLoad > capacity) throw new DomainRuleException("Initial capacity profile is infeasible.");
        var load = initialLoad;
        foreach (var change in changes) {
            load += change;
            if (load < 0 || load > capacity) throw new DomainRuleException("Capacity is violated at a stop.");
        }
    }
}

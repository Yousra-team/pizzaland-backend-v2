import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const prismaMock = vi.hoisted(() => ({
    products: { findUnique: vi.fn() },
    productVariants: { findUnique: vi.fn(), findMany: vi.fn(), count: vi.fn() },
    menu: { findUnique: vi.fn() },
    addons: { findUnique: vi.fn() },
    shippingAddresses: { findUnique: vi.fn() },
    table: { findUnique: vi.fn() },
    customers: { findUnique: vi.fn() },
    employees: { findUnique: vi.fn() },
    orders: { create: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn(), deleteMany: vi.fn(), findUniqueOrThrow: vi.fn() },
    orderItems: { create: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    deliveries: { create: vi.fn(), updateMany: vi.fn() },
    pickupOrders: { create: vi.fn(), updateMany: vi.fn() },
    dineInOrders: { create: vi.fn(), updateMany: vi.fn() },
    $transaction: vi.fn(),
}));
vi.mock("../../source/lib/prisma.js", () => ({ prisma: prismaMock }));

vi.mock("../../source/utilities/counter.js", () => ({ CreateIdentifier: vi.fn() }));

// Real coin conversion, fake wallet write
vi.mock("../../source/crm/account.js", async (importOriginal) => {
    const real = await importOriginal<typeof import("../../source/crm/account.js")>();
    return { ...real, creditAccount: vi.fn() };
});

import {
    placeOrder,
    GuestplaceOrder,
    getOrdersByBranch,
    getMyOrders,
    updateOrder,
    updateOrderStatus,
    deleteOrders,
    dispatchOrder,
    getStationOrders,
    updateOrderItemStatus,
} from "../../source/orders/order.service.js";
import { CreateIdentifier } from "../../source/utilities/counter.js";
import { creditAccount } from "../../source/crm/account.js";
import { mockReq, mockRes } from "../helpers/http.js";

const NOW = new Date("2026-10-24T10:00:00Z");
const minutesFromNow = (minutes: number) => new Date(NOW.getTime() + minutes * 60 * 1000);

const cashier = { Id: "cashier@yousracompany.com", role: "CASHIER" };
const customer = { Id: "cust_1", role: "CUSTOMER" };

// What the saved order looked like
const createdOrder = () => prismaMock.orders.create.mock.calls[0][0].data;

beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    prismaMock.$transaction.mockImplementation((cb: any) => cb(prismaMock));
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});

    // A default menu card: one pizza at 4500 that takes 15 minutes
    prismaMock.products.findUnique.mockResolvedValue({ price: 4500, preparationTime: 15 });
    prismaMock.orders.create.mockImplementation(({ data }: any) => Promise.resolve({ number: "ORD-1", ...data }));
    vi.mocked(CreateIdentifier).mockImplementation(async (type: string) => `${type}-PZ20261024-0001`);
});

afterEach(() => {
    vi.useRealTimers();
});

const pizza = (quantity = 1) => ({ type: "product", productId: "p1", quantity });
const pickupBody = (items: any[] = [pizza()]) => ({ orderType: "pickup", branchId: "br_1", pickupTime: "2026-10-24T12:00:00Z", items });

describe("placeOrder", () => {
    it("answers 400 for an invalid body and starts no transaction", async () => {
        const res = mockRes();

        await placeOrder(mockReq({ user: cashier, body: { orderType: "pickup", items: [] } }), res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });

    // Prices always come from the database (CLAUDE.md, decision 3)
    it("computes the subtotal from database prices and ignores client prices", async () => {
        const res = mockRes();

        await placeOrder(mockReq({ user: cashier, body: { ...pickupBody([{ ...pizza(2), price: 1 }]), total: 1 } }), res);

        expect(createdOrder()).toMatchObject({ subtotal: 9000, discount: 0, total: 9000, status: "pending", branchId: "br_1" });
        expect(res.status).toHaveBeenCalledWith(201);
    });

    it("uses the variant price instead of the product price", async () => {
        prismaMock.productVariants.findUnique.mockResolvedValue({ price: 6500, productId: "p1" });

        await placeOrder(mockReq({ user: cashier, body: pickupBody([{ ...pizza(2), productVariantId: "v_large" }]) }), mockRes());

        expect(createdOrder().subtotal).toBe(13000);
        expect(prismaMock.orderItems.create.mock.calls[0][0].data.price).toBe(6500);
    });

    // Otherwise a cheap variant of another product could be used to pay less
    it("creates no order when the variant belongs to another product", async () => {
        prismaMock.productVariants.findUnique.mockResolvedValue({ price: 100, productId: "p_other" });
        const res = mockRes();

        await placeOrder(mockReq({ user: cashier, body: pickupBody([{ ...pizza(), productVariantId: "v_x" }]) }), res);

        expect(prismaMock.orders.create).not.toHaveBeenCalled();
        expect(res.status).not.toHaveBeenCalledWith(201);
    });

    it("adds up products, menus and addons", async () => {
        prismaMock.menu.findUnique.mockResolvedValue({ price: 12000, preparationTime: 25 });
        prismaMock.addons.findUnique.mockResolvedValue({ price: 500 });

        await placeOrder(mockReq({
            user: cashier,
            body: pickupBody([
                pizza(1),
                { type: "menu", menuId: "m1", quantity: 1 },
                { type: "addons", addonId: "a1", quantity: 3 },
            ]),
        }), mockRes());

        expect(createdOrder().subtotal).toBe(4500 + 12000 + 1500);
        expect(prismaMock.orderItems.create).toHaveBeenCalledTimes(3);
    });

    it("gives each item its own estimatedReadyAt from its preparation time", async () => {
        prismaMock.addons.findUnique.mockResolvedValue({ price: 500 });

        await placeOrder(mockReq({ user: cashier, body: pickupBody([pizza(), { type: "addons", addonId: "a1", quantity: 1 }]) }), mockRes());

        const [pizzaItem, addonItem] = prismaMock.orderItems.create.mock.calls.map((call: any) => call[0].data);
        expect(pizzaItem).toMatchObject({ status: "pending", estimatedReadyAt: minutesFromNow(15) });
        expect(addonItem).toMatchObject({ addonId: "a1", estimatedReadyAt: minutesFromNow(0) });
    });

    it("pickup: uses the branch from the body and creates the pickup row", async () => {
        await placeOrder(mockReq({ user: cashier, body: pickupBody() }), mockRes());

        expect(prismaMock.pickupOrders.create).toHaveBeenCalledWith({
            data: { id: "PICKUP-PZ20261024-0001", orderNumber: "ORD-1", pickupTime: new Date("2026-10-24T12:00:00Z") },
        });
    });

    it("delivery: takes branch and fee from the shipping address, ETA = longest prep + delivery time", async () => {
        prismaMock.shippingAddresses.findUnique.mockResolvedValue({ deliveryFee: 1000, deliveryTime: 30, branchId: "br_2" });
        prismaMock.menu.findUnique.mockResolvedValue({ price: 12000, preparationTime: 25 });

        await placeOrder(mockReq({
            user: cashier,
            body: { orderType: "delivery", shippingAddressName: "Bastos", items: [pizza(), { type: "menu", menuId: "m1", quantity: 1 }] },
        }), mockRes());

        expect(createdOrder()).toMatchObject({ branchId: "br_2", subtotal: 16500, total: 17500 });
        expect(prismaMock.deliveries.create).toHaveBeenCalledWith({
            data: {
                id: "DEL-PZ20261024-0001",
                orderNumber: "ORD-1",
                shippingAddressName: "Bastos",
                status: "pending",
                estimatedDeliveryTime: minutesFromNow(25 + 30), // the menu (25 min) is the slowest item
            },
        });
    });

    it("dineIn: takes the branch from the table's floor and creates the dine-in row", async () => {
        prismaMock.table.findUnique.mockResolvedValue({ floorId: "f1", floor: { branchId: "br_3" } });

        await placeOrder(mockReq({ user: cashier, body: { orderType: "dineIn", tableId: "tbl_1", items: [pizza()] } }), mockRes());

        expect(createdOrder().branchId).toBe("br_3");
        expect(prismaMock.dineInOrders.create).toHaveBeenCalledWith({
            data: { id: "DINE-PZ20261024-0001", orderNumber: "ORD-1", tableId: "tbl_1" },
        });
    });

    it("rewards the customer with 10% of the total in coins, inside the transaction", async () => {
        prismaMock.customers.findUnique.mockResolvedValue({ customerId: "cust_9", accounts: { balance: 0 } });

        await placeOrder(mockReq({ user: cashier, body: { ...pickupBody([pizza(2)]), customerPhone: "+237699000000" } }), mockRes());

        // 10% of 9000 XAF = 900 XAF = 36 coins
        expect(creditAccount).toHaveBeenCalledWith("cust_9", 36, prismaMock);
    });

    it("gives no reward when the customer has no account", async () => {
        prismaMock.customers.findUnique.mockResolvedValue({ customerId: "cust_9", accounts: null });

        await placeOrder(mockReq({ user: cashier, body: { ...pickupBody(), customerPhone: "+237699000000" } }), mockRes());

        expect(creditAccount).not.toHaveBeenCalled();
    });

    it("gives no reward when it rounds down to 0 coins", async () => {
        prismaMock.products.findUnique.mockResolvedValue({ price: 1, preparationTime: 0 });
        prismaMock.customers.findUnique.mockResolvedValue({ customerId: "cust_9", accounts: { balance: 0 } });

        await placeOrder(mockReq({ user: cashier, body: { ...pickupBody(), customerPhone: "+237699000000" } }), mockRes());

        expect(creditAccount).not.toHaveBeenCalled(); // 10% of 1 XAF = 0.004 coins -> 0
    });

    // ── Bugs ──

    // Orders now point to customers by customerId; the token's Id IS the customerId
    it("BUG #3: saves a customer's order with customerId and credits their reward", async () => {
        prismaMock.customers.findUnique.mockImplementation(({ where }: any) =>
            Promise.resolve(where.customerId === "cust_1" ? { customerId: "cust_1", accounts: { balance: 0 } } : null));
        const res = mockRes();

        await placeOrder(mockReq({ user: customer, body: pickupBody([pizza(2)]) }), res);

        expect(createdOrder()).toMatchObject({ customerId: "cust_1" });
        expect(createdOrder()).not.toHaveProperty("customerPhone");
        expect(creditAccount).toHaveBeenCalledWith("cust_1", 36, prismaMock);
        expect(res.status).toHaveBeenCalledTimes(1);
        expect(res.status).toHaveBeenCalledWith(201);
    });

    it("BUG #3: links a staff order to the customer's customerId, found by phone", async () => {
        prismaMock.customers.findUnique.mockResolvedValue({ customerId: "cust_9", accounts: null });

        await placeOrder(mockReq({ user: cashier, body: { ...pickupBody(), customerPhone: "+237699000000" } }), mockRes());

        expect(createdOrder()).toMatchObject({ customerId: "cust_9" });
        expect(createdOrder()).not.toHaveProperty("customerPhone");
    });

    // A response sent inside the transaction is followed by a second res.status(201)
    it("BUG #4: sends exactly one error response when the customer phone is unknown", async () => {
        prismaMock.customers.findUnique.mockResolvedValue(null);
        const res = mockRes();

        await placeOrder(mockReq({ user: cashier, body: { ...pickupBody(), customerPhone: "+237699000000" } }), res);

        expect(res.status).toHaveBeenCalledTimes(1);
        expect(res.status).not.toHaveBeenCalledWith(201);
    });

    it("BUG #4: sends exactly one error response when no delivery id could be made", async () => {
        prismaMock.shippingAddresses.findUnique.mockResolvedValue({ deliveryFee: 1000, deliveryTime: 30, branchId: "br_2" });
        vi.mocked(CreateIdentifier).mockResolvedValue(undefined);
        const res = mockRes();

        await placeOrder(mockReq({ user: cashier, body: { orderType: "delivery", shippingAddressName: "Bastos", items: [pizza()] } }), res);

        expect(res.status).toHaveBeenCalledTimes(1);
        expect(res.status).not.toHaveBeenCalledWith(201);
    });

    // cashierEmail / waitressEmail were dropped from Orders (schema.prisma header)
    it("BUG #5: a cashier's order only uses columns that exist on Orders", async () => {
        prismaMock.customers.findUnique.mockResolvedValue({ customerId: "cust_9", accounts: null });

        await placeOrder(mockReq({ user: cashier, body: { ...pickupBody(), customerPhone: "+237699000000" } }), mockRes());

        expect(createdOrder()).not.toHaveProperty("cashierEmail");
        expect(createdOrder()).not.toHaveProperty("waitressEmail");
    });

    // An employee ordering for themselves is the payroll customer of the order
    it("BUG #5: an employee's own order is saved with payrollEmployeeEmail", async () => {
        await placeOrder(mockReq({ user: cashier, body: pickupBody() }), mockRes());

        expect(createdOrder()).toMatchObject({ payrollEmployeeEmail: cashier.Id });
        expect(createdOrder()).not.toHaveProperty("employeeEmail");
    });

    it("BUG #11: answers 400 INVALID_VARIANT when a product with variants is ordered without one", async () => {
        prismaMock.products.findUnique.mockResolvedValue({ price: 4500, preparationTime: 15, variants: [{ id: "v_large" }] });
        prismaMock.productVariants.findMany.mockResolvedValue([{ id: "v_large" }]);
        prismaMock.productVariants.count.mockResolvedValue(1);
        const res = mockRes();

        await placeOrder(mockReq({ user: cashier, body: pickupBody() }), res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(JSON.stringify(res.json.mock.calls[0][0])).toContain("INVALID_VARIANT");
        expect(prismaMock.orders.create).not.toHaveBeenCalled();
    });

    // A wrong product id is the client's mistake, not a server crash
    it("BUG #11: answers 404, not 500, when a product does not exist", async () => {
        prismaMock.products.findUnique.mockResolvedValue(null);
        const res = mockRes();

        await placeOrder(mockReq({ user: cashier, body: pickupBody() }), res);

        expect(res.status).toHaveBeenCalledWith(404);
    });
});

describe("GuestplaceOrder", () => {
    const guest = { guestName: "Paul", guestPhone: "+237699111111" };

    it("saves the guest's name and phone with server-side prices", async () => {
        const res = mockRes();

        await GuestplaceOrder(mockReq({ body: { ...pickupBody([pizza(2)]), ...guest } }), res);

        expect(createdOrder()).toMatchObject({ ...guest, subtotal: 9000, total: 9000, branchId: "br_1" });
        expect(res.status).toHaveBeenCalledWith(201);
    });

    it("gives no reward (a guest has no account)", async () => {
        await GuestplaceOrder(mockReq({ body: { ...pickupBody(), ...guest } }), mockRes());

        expect(creditAccount).not.toHaveBeenCalled();
    });

    it("dineIn: takes the branch from the table's floor", async () => {
        prismaMock.table.findUnique.mockResolvedValue({ floorId: "f1", floor: { branchId: "br_3" } });

        await GuestplaceOrder(mockReq({ body: { orderType: "dineIn", tableId: "tbl_1", items: [pizza()], ...guest } }), mockRes());

        expect(createdOrder().branchId).toBe("br_3");
        expect(prismaMock.dineInOrders.create).toHaveBeenCalled();
    });

    it("BUG #4: sends exactly one error response when no pickup id could be made", async () => {
        vi.mocked(CreateIdentifier).mockResolvedValue(undefined);
        const res = mockRes();

        await GuestplaceOrder(mockReq({ body: { ...pickupBody(), ...guest } }), res);

        expect(res.status).toHaveBeenCalledTimes(1);
        expect(res.status).not.toHaveBeenCalledWith(201);
    });
});

describe("getOrdersByBranch", () => {
    it("answers 401 for a customer", async () => {
        const res = mockRes();

        await getOrdersByBranch(mockReq({ user: customer }), res);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(prismaMock.orders.findMany).not.toHaveBeenCalled();
    });

    it("answers 400 for an employee without a branch", async () => {
        prismaMock.employees.findUnique.mockResolvedValue({ branchId: null, role: "CASHIER" });
        const res = mockRes();

        await getOrdersByBranch(mockReq({ user: cashier }), res);

        expect(res.status).toHaveBeenCalledWith(400);
    });

    it("answers 400 for an unknown status filter", async () => {
        const res = mockRes();

        await getOrdersByBranch(mockReq({ user: cashier, query: { status: "lost" } }), res);

        expect(res.status).toHaveBeenCalledWith(400);
    });

    it.each([
        [{}, { branchId: "br_1" }],
        [{ status: "pending" }, { branchId: "br_1", status: "pending" }],
    ])("query %j filters with %j", async (query, where) => {
        prismaMock.employees.findUnique.mockResolvedValue({ branchId: "br_1", role: "CASHIER" });
        prismaMock.orders.findMany.mockResolvedValue([]);

        await getOrdersByBranch(mockReq({ user: cashier, query }), mockRes());

        expect(prismaMock.orders.findMany.mock.calls[0][0].where).toEqual(where);
    });
});

describe("getMyOrders", () => {
    const final = ["successful", "delivered", "cancelled"];

    it.each([
        [undefined, { notIn: final }],
        ["history", { in: final }],
    ])("view=%s filters statuses with %j", async (view, status) => {
        prismaMock.orders.findMany.mockResolvedValue([]);

        await getMyOrders(mockReq({ user: customer, query: { view } }), mockRes());

        expect(prismaMock.orders.findMany.mock.calls[0][0].where.status).toEqual(status);
    });

    it("BUG #6: only returns the logged-in customer's orders, by customerId", async () => {
        prismaMock.orders.findMany.mockResolvedValue([]);

        await getMyOrders(mockReq({ user: customer, query: {} }), mockRes());

        const where = prismaMock.orders.findMany.mock.calls[0][0].where;
        expect(where.customerId).toBe("cust_1");
        expect(where).not.toHaveProperty("customerPhone");
    });
});

describe("updateOrder", () => {
    const req = (body: any) => mockReq({ user: cashier, params: { number: "ORD-1" }, body });

    beforeEach(() => {
        prismaMock.orders.findUnique.mockResolvedValue({ orderType: "pickup", subtotal: 10000, discount: 1000, total: 9000 });
        prismaMock.orders.findUniqueOrThrow.mockResolvedValue({ number: "ORD-1" });
    });

    it("answers 403 for a customer", async () => {
        const res = mockRes();

        await updateOrder(mockReq({ user: customer, params: { number: "ORD-1" }, body: { status: "ready" } }), res);

        expect(res.status).toHaveBeenCalledWith(403);
    });

    it("answers 400 for an empty body", async () => {
        const res = mockRes();

        await updateOrder(req({}), res);

        expect(res.status).toHaveBeenCalledWith(400);
    });

    it("answers 404 when the order does not exist", async () => {
        prismaMock.orders.findUnique.mockResolvedValue(null);
        const res = mockRes();

        await updateOrder(req({ status: "ready" }), res);

        expect(res.status).toHaveBeenCalledWith(404);
    });

    it.each([
        ["tableId on a pickup order", { tableId: "tbl_1" }],
        ["a delivery field on a pickup order", { driverEmail: "d@yousracompany.com" }],
    ])("answers 400 for %s", async (_label, body) => {
        const res = mockRes();

        await updateOrder(req(body), res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });

    it("answers 400 for pickupTime on a delivery order", async () => {
        prismaMock.orders.findUnique.mockResolvedValue({ orderType: "delivery", subtotal: 10000, discount: 0, total: 11000 });
        const res = mockRes();

        await updateOrder(req({ pickupTime: "2026-10-24T12:00:00Z" }), res);

        expect(res.status).toHaveBeenCalledWith(400);
    });

    it("answers 404 when the driver does not exist", async () => {
        prismaMock.orders.findUnique.mockResolvedValue({ orderType: "delivery", subtotal: 10000, discount: 0, total: 11000 });
        prismaMock.employees.findUnique.mockResolvedValue(null);
        const res = mockRes();

        await updateOrder(req({ driverEmail: "d@yousracompany.com" }), res);

        expect(res.status).toHaveBeenCalledWith(404);
    });

    it("answers 400 when the driver is not a DELIVERY_DRIVER", async () => {
        prismaMock.orders.findUnique.mockResolvedValue({ orderType: "delivery", subtotal: 10000, discount: 0, total: 11000 });
        prismaMock.employees.findUnique.mockResolvedValue({ role: "CASHIER" });
        const res = mockRes();

        await updateOrder(req({ driverEmail: "d@yousracompany.com" }), res);

        expect(res.status).toHaveBeenCalledWith(400);
    });

    it("answers 400 for a discount bigger than the subtotal", async () => {
        const res = mockRes();

        await updateOrder(req({ discount: 10001 }), res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });

    // total 9000 = 10000 - 1000; the new discount 2500 gives 10000 - 2500 = 7500
    it("recomputes the total from the old and the new discount", async () => {
        const res = mockRes();

        await updateOrder(req({ discount: 2500 }), res);

        expect(prismaMock.orders.update).toHaveBeenCalledWith({
            where: { number: "ORD-1" },
            data: { status: undefined, discount: 2500, total: 7500, employeeEmail: undefined },
        });
        expect(res.status).toHaveBeenCalledWith(200);
    });

    it("updates only the pickup row for a pickupTime change", async () => {
        await updateOrder(req({ pickupTime: "2026-10-24T13:00:00Z" }), mockRes());

        expect(prismaMock.pickupOrders.updateMany).toHaveBeenCalledWith({
            where: { orderNumber: "ORD-1" },
            data: { pickupTime: new Date("2026-10-24T13:00:00Z") },
        });
        expect(prismaMock.orders.update).not.toHaveBeenCalled();
    });

    it("updates the delivery row for delivery fields", async () => {
        prismaMock.orders.findUnique.mockResolvedValue({ orderType: "delivery", subtotal: 10000, discount: 0, total: 11000 });
        prismaMock.employees.findUnique.mockResolvedValue({ role: "DELIVERY_DRIVER" });

        await updateOrder(req({ driverEmail: "d@yousracompany.com", deliveryStatus: "assigned" }), mockRes());

        expect(prismaMock.deliveries.updateMany.mock.calls[0][0]).toMatchObject({
            where: { orderNumber: "ORD-1" },
            data: { driverEmail: "d@yousracompany.com", status: "assigned" },
        });
    });
});

describe("updateOrderStatus", () => {
    it("sets the status from the query", async () => {
        prismaMock.orders.update.mockResolvedValue({ number: "ORD-1" });
        const res = mockRes();

        await updateOrderStatus(mockReq({ params: { number: "ORD-1" }, query: { status: "ready" } }), res);

        expect(prismaMock.orders.update.mock.calls[0][0]).toMatchObject({ where: { number: "ORD-1" }, data: { status: "ready" } });
        expect(res.status).toHaveBeenCalledWith(200);
    });

    it("answers 400 for an unknown status", async () => {
        const res = mockRes();

        await updateOrderStatus(mockReq({ params: { number: "ORD-1" }, query: { status: "lost" } }), res);

        expect(res.status).toHaveBeenCalledWith(400);
    });

    it("BUG #12: answers 400 when ?status is missing", async () => {
        const res = mockRes();

        await updateOrderStatus(mockReq({ params: { number: "ORD-1" }, query: {} }), res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(prismaMock.orders.update).not.toHaveBeenCalled();
    });
});

describe("deleteOrders", () => {
    it("answers 400 without order numbers", async () => {
        const res = mockRes();

        await deleteOrders(mockReq({ body: { numbers: [] } }), res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(prismaMock.orders.deleteMany).not.toHaveBeenCalled();
    });

    it("answers 404 when none of the orders exist", async () => {
        prismaMock.orders.deleteMany.mockResolvedValue({ count: 0 });
        const res = mockRes();

        await deleteOrders(mockReq({ body: { numbers: ["ORD-9"] } }), res);

        expect(res.status).toHaveBeenCalledWith(404);
    });

    it("deletes only the given orders", async () => {
        prismaMock.orders.deleteMany.mockResolvedValue({ count: 2 });
        const res = mockRes();

        await deleteOrders(mockReq({ body: { numbers: ["ORD-1", "ORD-2"] } }), res);

        expect(prismaMock.orders.deleteMany).toHaveBeenCalledWith({ where: { number: { in: ["ORD-1", "ORD-2"] } } });
        expect(res.status).toHaveBeenCalledWith(200);
    });
});

describe("dispatchOrder", () => {
    const req = () => mockReq({ params: { number: "ORD-1" } });

    it("answers 404 when the order does not exist", async () => {
        prismaMock.orders.findUnique.mockResolvedValue(null);
        const res = mockRes();

        await dispatchOrder(req(), res);

        expect(res.status).toHaveBeenCalledWith(404);
    });

    it("sends a pending order and all its items to the stations in one transaction", async () => {
        prismaMock.orders.findUnique.mockResolvedValue({ number: "ORD-1", status: "pending" });
        const res = mockRes();

        await dispatchOrder(req(), res);

        expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
        expect(prismaMock.orders.update).toHaveBeenCalledWith({ where: { number: "ORD-1" }, data: { status: "preparing" } });
        expect(prismaMock.orderItems.updateMany).toHaveBeenCalledWith({ where: { orderNumber: "ORD-1" }, data: { status: "in_station" } });
        expect(res.status).toHaveBeenCalledWith(200);
    });

    // FRONTEND_API_CONVENTIONS §5: "409 if already dispatched or finished"
    it.each(["preparing", "ready", "delivered"])("BUG #10: answers 409 for an order that is %s", async (status) => {
        prismaMock.orders.findUnique.mockResolvedValue({ number: "ORD-1", status });
        const res = mockRes();

        await dispatchOrder(req(), res);

        expect(res.status).toHaveBeenCalledWith(409);
        expect(prismaMock.orders.update).not.toHaveBeenCalled();
    });
});

describe("getStationOrders", () => {
    // Two stations: st_oven (pizzas) and st_bar (drinks).
    // ORD-1: 1 Margherita (oven) + its addon, 1 Coke (bar), 3 Family menus (2 pizzas from the oven + 1 Coke each)
    // ORD-2: only a Coke, so it has nothing for the oven
    beforeEach(() => {
        prismaMock.orders.findMany.mockResolvedValue([
            {
                number: "ORD-1",
                items: [
                    { type: "product", productId: "p_margherita", quantity: 1, addonId: null, productVariant: { name: "Large" } },
                    { type: "addons", productId: null, quantity: 1, addonId: "a_cheese" },
                    { type: "product", productId: "p_coke", quantity: 1, addonId: null, productVariant: null },
                    { type: "menu", menuId: "m_family", quantity: 3, addonId: null },
                ],
            },
            {
                number: "ORD-2",
                items: [{ type: "product", productId: "p_coke", quantity: 2, addonId: null, productVariant: null }],
            },
        ]);
        prismaMock.products.findUnique.mockImplementation(({ where }: any) => Promise.resolve({
            p_margherita: { id: "p_margherita", name: "Margherita", station: { id: "st_oven" }, addons: [{ id: "a_cheese" }] },
            p_coke: { id: "p_coke", name: "Coke", station: { id: "st_bar" }, addons: [] },
        }[where.id as string]));
        prismaMock.menu.findUnique.mockResolvedValue({
            name: "Family",
            items: [
                { id: "mi_pizza", quantity: 2, product: { name: "Pepperoni", stationId: "st_oven" } },
                { id: "mi_coke", quantity: 1, product: { name: "Coke", stationId: "st_bar" } },
            ],
        });
    });

    it("only reads orders that are being prepared", async () => {
        await getStationOrders(mockReq({ params: { stationId: "st_oven" } }), mockRes());

        expect(prismaMock.orders.findMany.mock.calls[0][0].where).toEqual({ status: "preparing" });
    });

    it("builds tickets with only this station's items", async () => {
        const res = mockRes();

        await getStationOrders(mockReq({ params: { stationId: "st_oven" } }), res);

        const tickets = res.json.mock.calls[0][0].data;
        expect(tickets).toHaveLength(1); // ORD-2 has nothing for the oven
        expect(tickets[0].orderNumber).toBe("ORD-1");
        expect(tickets[0].items).toEqual([
            {
                itemId: "p_margherita",
                itemName: "Margherita",
                itemVariant: "Large",
                itemType: "product",
                quantity: 1,
                addons: [expect.objectContaining({ addonId: "a_cheese" })], // the cheese goes with this pizza
            },
            // 3 menus x 2 pizzas per menu
            { itemId: "mi_pizza", itemName: "Pepperoni", itemType: "menu", menuName: "Family", quantity: 6 },
        ]);
    });

    it("gives the bar its drinks from both orders", async () => {
        const res = mockRes();

        await getStationOrders(mockReq({ params: { stationId: "st_bar" } }), res);

        const tickets = res.json.mock.calls[0][0].data;
        expect(tickets.map((t: any) => t.orderNumber)).toEqual(["ORD-1", "ORD-2"]);
        expect(tickets[0].items.map((i: any) => [i.itemName, i.quantity])).toEqual([["Coke", 1], ["Coke", 3]]);
    });

    it("returns no tickets for a station with nothing to do", async () => {
        const res = mockRes();

        await getStationOrders(mockReq({ params: { stationId: "st_desserts" } }), res);

        expect(res.json).toHaveBeenCalledWith({ data: [] });
    });
});

describe("updateOrderItemStatus", () => {
    const req = () => mockReq({ params: { itemId: "item_1" } });

    it("answers 404 when the item does not exist", async () => {
        prismaMock.orderItems.findUnique.mockResolvedValue(null);
        const res = mockRes();

        await updateOrderItemStatus(req(), res);

        expect(res.status).toHaveBeenCalledWith(404);
    });

    it("answers 400 for an item that is not in a station", async () => {
        prismaMock.orderItems.findUnique.mockResolvedValue({ id: "item_1", status: "pending", orderNumber: "ORD-1" });
        const res = mockRes();

        await updateOrderItemStatus(req(), res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(prismaMock.orderItems.update).not.toHaveBeenCalled();
    });

    it("marks the item ready and keeps the order open while other items remain", async () => {
        prismaMock.orderItems.findUnique.mockResolvedValue({ id: "item_1", status: "in_station", orderNumber: "ORD-1" });
        prismaMock.orderItems.findMany.mockResolvedValue([{ id: "item_2" }]);
        const res = mockRes();

        await updateOrderItemStatus(req(), res);

        expect(prismaMock.orderItems.update).toHaveBeenCalledWith({ where: { id: "item_1" }, data: { status: "ready" } });
        expect(prismaMock.orders.update).not.toHaveBeenCalled();
        expect(res.json.mock.calls[0][0].data.orderReady).toBe(false);
    });

    it("marks the order ready when its last item is ready", async () => {
        prismaMock.orderItems.findUnique.mockResolvedValue({ id: "item_1", status: "in_station", orderNumber: "ORD-1" });
        prismaMock.orderItems.findMany.mockResolvedValue([]);
        const res = mockRes();

        await updateOrderItemStatus(req(), res);

        expect(prismaMock.orders.update).toHaveBeenCalledWith({ where: { number: "ORD-1" }, data: { status: "ready" } });
        expect(res.json.mock.calls[0][0].data.orderReady).toBe(true);
    });
});

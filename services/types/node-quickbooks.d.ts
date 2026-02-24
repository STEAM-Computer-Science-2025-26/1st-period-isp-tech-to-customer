declare module "node-quickbooks" {
	type Callback<T = any> = (err: any, result: T) => void;

	class QuickBooks {
		constructor(
			clientId: string,
			clientSecret: string,
			accessToken: string,
			useTokenSecret: boolean,
			realmId: string,
			useSandbox: boolean,
			debug: boolean,
			minorVersion: string | null,
			oauthVersion: string,
			refreshToken: string | null
		);

		createCustomer(customer: Record<string, any>, callback: Callback): void;
		updateCustomer(customer: Record<string, any>, callback: Callback): void;
		getCustomer(id: string, callback: Callback): void;

		createInvoice(invoice: Record<string, any>, callback: Callback): void;
		updateInvoice(invoice: Record<string, any>, callback: Callback): void;
		getInvoice(id: string, callback: Callback): void;
		voidInvoice(id: string, callback: Callback): void;

		createPayment(payment: Record<string, any>, callback: Callback): void;
		getPayment(id: string, callback: Callback): void;

		createItem(item: Record<string, any>, callback: Callback): void;
		updateItem(item: Record<string, any>, callback: Callback): void;
		getItem(id: string, callback: Callback): void;
	}

	export = QuickBooks;
}

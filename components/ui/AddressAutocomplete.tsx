"use client";

import { useEffect, useRef, useState } from "react";
import { useMapsLibrary } from "@vis.gl/react-google-maps";
import { cn } from "@/lib/utils";

export type AddressSelection = {
	streetAddress: string;
	city: string;
	state: string;
	postalCode: string;
	fullAddress: string;
	placeId: string;
};

type AddressAutocompleteProps = {
	value: string;
	onChange: (value: string) => void;
	onAddressSelected?: (selection: AddressSelection) => void;
	className?: string;
	inputClassName?: string;
	placeholder?: string;
	disabled?: boolean;
};

function getComponent(
	components: google.maps.GeocoderAddressComponent[] | undefined,
	type: string
): google.maps.GeocoderAddressComponent | undefined {
	return components?.find((component) => component.types.includes(type));
}

function parseSelection(
	prediction: google.maps.places.AutocompletePrediction,
	place: google.maps.places.PlaceResult | null
): AddressSelection {
	const components = place?.address_components;
	const streetNumber =
		getComponent(components, "street_number")?.long_name ?? "";
	const route = getComponent(components, "route")?.long_name ?? "";
	const city =
		getComponent(components, "locality")?.long_name ??
		getComponent(components, "postal_town")?.long_name ??
		getComponent(components, "administrative_area_level_2")?.long_name ??
		"";
	const state =
		getComponent(components, "administrative_area_level_1")?.short_name ?? "";
	const postalCode = getComponent(components, "postal_code")?.long_name ?? "";
	const fullAddress = place?.formatted_address ?? prediction.description;
	const fallbackStreet =
		prediction.structured_formatting.main_text || fullAddress;
	const streetAddress =
		[streetNumber, route].filter(Boolean).join(" ") || fallbackStreet;

	return {
		streetAddress,
		city,
		state,
		postalCode,
		fullAddress,
		placeId: prediction.place_id
	};
}

export default function AddressAutocomplete({
	value,
	onChange,
	onAddressSelected,
	className,
	inputClassName,
	placeholder = "Start typing an address...",
	disabled
}: AddressAutocompleteProps) {
	const placesLib = useMapsLibrary("places");
	const [predictions, setPredictions] = useState<
		google.maps.places.AutocompletePrediction[]
	>([]);
	const [focused, setFocused] = useState(false);
	const inputRef = useRef<HTMLInputElement>(null);
	const dropdownRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!placesLib || !value.trim() || disabled) {
			setPredictions([]);
			return;
		}
		const delay = setTimeout(() => {
			const service = new (placesLib as any).AutocompleteService();
			service.getPlacePredictions(
				{ input: value.trim(), types: ["address"] },
				(
					results: google.maps.places.AutocompletePrediction[] | null,
					status: string
				) => {
					if (status === "OK" && results) {
						setPredictions(results);
					} else {
						setPredictions([]);
					}
				}
			);
		}, 300);
		return () => clearTimeout(delay);
	}, [value, placesLib, disabled]);

	useEffect(() => {
		const handler = (event: MouseEvent) => {
			if (
				inputRef.current &&
				!inputRef.current.contains(event.target as Node) &&
				dropdownRef.current &&
				!dropdownRef.current.contains(event.target as Node)
			) {
				setFocused(false);
			}
		};
		document.addEventListener("mousedown", handler);
		return () => document.removeEventListener("mousedown", handler);
	}, []);

	const handleSelectPrediction = (
		prediction: google.maps.places.AutocompletePrediction
	) => {
		onChange(prediction.description);
		setPredictions([]);
		setFocused(false);

		if (!onAddressSelected) return;
		if (!placesLib) {
			onAddressSelected(
				parseSelection(prediction, {
					formatted_address: prediction.description
				} as google.maps.places.PlaceResult)
			);
			return;
		}

		const placesService = new (placesLib as any).PlacesService(
			document.createElement("div")
		);
		placesService.getDetails(
			{
				placeId: prediction.place_id,
				fields: ["address_components", "formatted_address"]
			},
			(place: google.maps.places.PlaceResult | null, status: string) => {
				if (status === "OK") {
					onAddressSelected(parseSelection(prediction, place));
					return;
				}
				onAddressSelected(parseSelection(prediction, null));
			}
		);
	};

	return (
		<div className={cn("relative", className)}>
			<input
				ref={inputRef}
				value={value}
				onChange={(event) => onChange(event.target.value)}
				onFocus={() => setFocused(true)}
				disabled={disabled}
				className={cn(
					"w-full rounded-lg border border-background-secondary bg-background-primary/50 px-2 py-1 text-sm text-text-main focus:outline-none focus:border-accent-main/50 disabled:opacity-50",
					inputClassName
				)}
				placeholder={placeholder}
			/>
			{focused && predictions.length > 0 ? (
				<div
					ref={dropdownRef}
					className="absolute left-0 top-full z-30 mt-1 w-full overflow-hidden rounded-lg border border-background-secondary bg-background-secondary shadow-lg"
				>
					{predictions.map((prediction) => (
						<button
							key={prediction.place_id}
							type="button"
							onMouseDown={() => handleSelectPrediction(prediction)}
							className="w-full text-left px-3 py-2 text-xs text-text-secondary hover:bg-background-primary/60 hover:text-text-main transition-colors"
						>
							{prediction.description}
						</button>
					))}
				</div>
			) : null}
		</div>
	);
}
